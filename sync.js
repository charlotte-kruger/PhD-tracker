/* Persistence: always a local cache (so nothing is lost offline), plus OneDrive sync through
   Microsoft Graph when a Microsoft Entra "Client ID" is configured. No backend and no secrets:
   this is a public (SPA/PKCE) client; tokens live in the browser's own MSAL cache only.
   Conflict safety: every upload is conditional on the file's ETag (If-Match). If another device
   changed the file, we download it, merge (per-item last-writer-wins + deletion tombstones), and retry. */
(function () {
  const CACHE_KEY = 'phd.cache.v1';
  const CLIENT_KEY = 'phd.clientId';
  const AUTH_KEY = 'phd.authority';
  const SCOPES = ['Files.ReadWrite'];
  const FILE = '/me/drive/root:/CharlottePhD/phd-data.json';
  const GRAPH = 'https://graph.microsoft.com/v1.0';

  const cfg = window.PHD_CONFIG || {};
  const clientId = () => localStorage.getItem(CLIENT_KEY) || cfg.clientId || '';
  const authority = () => localStorage.getItem(AUTH_KEY) || cfg.authority || 'https://login.microsoftonline.com/common';
  const redirectUri = () => location.origin + location.pathname.replace(/index\.html$/, '');

  let msal = null, account = null, connected = false;
  let etag = null, dirty = false, running = false, rerun = false, timer = null;
  let status = { kind: 'local', msg: 'Saved on this device only' };
  const listeners = [];
  const setStatus = (kind, msg) => { status = { kind, msg }; listeners.forEach((f) => f(status)); };

  /* ---------- local cache ---------- */
  function writeCache() {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ state: Model.get(), dirty, etag })); } catch (e) { setStatus('error', 'Browser storage is full or blocked'); }
  }
  function readCache() { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (e) { return null; } }

  /* ---------- Graph helpers ---------- */
  async function token() {
    const r = await msal.acquireTokenSilent({ scopes: SCOPES, account });
    return r.accessToken;
  }
  async function graph(path, opts = {}) {
    const t = await token();
    return fetch(GRAPH + path, Object.assign({}, opts, { headers: Object.assign({ Authorization: 'Bearer ' + t }, opts.headers || {}) }));
  }
  async function remoteMeta() {
    const r = await graph(FILE);
    if (r.status === 404) return null;
    if (!r.ok) throw httpErr(r);
    return r.json();
  }
  async function remoteDownload(meta) {
    const url = meta['@microsoft.graph.downloadUrl'];
    const r = url ? await fetch(url) : await graph(FILE + ':/content');
    if (!r.ok) throw httpErr(r);
    return r.json();
  }
  async function remoteUpload(state, ifMatch) {
    const headers = { 'Content-Type': 'application/json' };
    let path = FILE + ':/content';
    if (ifMatch) headers['If-Match'] = ifMatch; else path += '?@microsoft.graph.conflictBehavior=fail';
    const r = await graph(path, { method: 'PUT', headers, body: JSON.stringify(state) });
    if (r.status === 412 || r.status === 409) { const e = new Error('conflict'); e.conflict = true; throw e; }
    if (!r.ok) throw httpErr(r);
    return r.json();
  }
  function httpErr(r) { const e = new Error('HTTP ' + r.status); e.status = r.status; return e; }

  /* ---------- sync loop ---------- */
  async function run() {
    if (!connected) return;
    if (running) { rerun = true; return; }
    running = true; clearTimeout(timer);
    setStatus('saving', 'Syncing with OneDrive…');
    try {
      for (let i = 0; i < 5; i++) {
        const meta = await remoteMeta();
        if (!meta) {
          try { const m = await remoteUpload(Model.get(), null); etag = m.eTag; dirty = false; break; }
          catch (e) { if (e.conflict) continue; throw e; }
        }
        if (meta.eTag !== etag) {
          const remote = await remoteDownload(meta);
          if (!Model.validate(remote)) throw new Error('The OneDrive file is not valid Charlotte\'s PhD data (or is from a newer version).');
          if (dirty) {
            const merged = Model.merge(remote);
            Model.replace(merged);
            dirty = U.stable(Model.get()) !== U.stable(remote);
          } else {
            Model.replace(remote);
            dirty = false;
          }
          etag = meta.eTag;
        }
        if (!dirty) break;
        try { const m = await remoteUpload(Model.get(), etag); etag = m.eTag; dirty = false; break; }
        catch (e) { if (e.conflict) continue; throw e; }
      }
      writeCache();
      setStatus('saved', 'All changes saved to OneDrive');
    } catch (e) {
      writeCache();
      if (e && (e.name === 'InteractionRequiredAuthError' || /interaction_required|login_required|consent_required/.test(e.errorCode || ''))) {
        setStatus('auth', 'OneDrive session expired – sign in again');
      } else if (e instanceof TypeError || !navigator.onLine) {
        setStatus('offline', 'Offline – changes are saved on this device and will sync later');
      } else {
        setStatus('error', 'Sync failed: ' + (e.message || e) + ' – changes are safe on this device');
      }
    } finally {
      running = false;
      if (rerun) { rerun = false; schedule(300); }
    }
  }
  function schedule(ms) { clearTimeout(timer); timer = setTimeout(run, ms); }

  /* ---------- public API ---------- */
  const Sync = {
    status: () => status,
    onStatus: (f) => listeners.push(f),
    isConfigured: () => !!clientId(),
    isConnected: () => connected,
    accountName: () => (account ? account.username : ''),
    redirectUri,
    clientId, authority,
    isDirty: () => dirty,
    setClientId(id, auth) { localStorage.setItem(CLIENT_KEY, id.trim()); if (auth) localStorage.setItem(AUTH_KEY, auth.trim()); },
    clearClientId() { localStorage.removeItem(CLIENT_KEY); localStorage.removeItem(AUTH_KEY); },
    retry: () => run(),

    async init() {
      const cached = readCache();
      if (cached && Model.validate(cached.state)) { Model.replace(cached.state); dirty = !!cached.dirty; etag = cached.etag || null; }
      else { Model.replace(Model.blank()); dirty = false; }
      Model.subscribe((kind) => { if (kind === 'change') { dirty = true; writeCache(); if (connected) { setStatus('saving', 'Saving…'); schedule(1200); } } });

      if (!clientId()) setStatus('local', 'Saved on this device only – connect OneDrive in Settings');
    },
    /** called after the first render so a slow/offline network never delays the UI */
    async connect() {
      if (!clientId()) return;
      if (!window.msal) { setStatus('error', 'Microsoft sign-in library failed to load'); return; }
      try {
        msal = await window.msal.PublicClientApplication.createPublicClientApplication({
          auth: { clientId: clientId(), authority: authority(), redirectUri: redirectUri(), postLogoutRedirectUri: redirectUri() },
          cache: { cacheLocation: 'localStorage' },
        });
        const res = await msal.handleRedirectPromise();
        account = (res && res.account) || msal.getAllAccounts()[0] || null;
        if (account) msal.setActiveAccount(account);
        if (location.hash.indexOf('code=') >= 0 || location.hash.indexOf('error=') >= 0) history.replaceState(null, '', location.pathname + location.search);
      } catch (e) { setStatus('error', 'Microsoft sign-in problem: ' + (e.message || e)); return; }
      if (!account) { setStatus('auth', 'OneDrive not signed in – click to sign in'); return; }
      connected = true;
      run();
      setInterval(() => { if (!dirty && !running) run(); }, 60000);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) run(); });
      window.addEventListener('online', () => run());
    },
    async signIn() {
      if (!msal) { location.reload(); return; }
      writeCache();
      await msal.loginRedirect({ scopes: SCOPES, prompt: 'select_account' });
    },
    async signOut() {
      writeCache();
      if (msal && account) { connected = false; await msal.logoutRedirect({ account }); }
    },
  };

  window.addEventListener('beforeunload', (e) => {
    if (connected && dirty && (status.kind === 'error' || status.kind === 'offline' || status.kind === 'saving')) { e.preventDefault(); e.returnValue = ''; }
  });
  window.Sync = Sync;
})();
