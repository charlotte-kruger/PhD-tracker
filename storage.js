/* Persistence: everything is saved automatically in this browser (localStorage) after every change.
   Use Settings > Data & backup to download an Excel export or a JSON backup at any time. */
(function () {
  const KEY = 'phd.data.v1';
  let status = { kind: 'saved', msg: 'All changes saved in this browser' };
  const listeners = [];
  const setStatus = (kind, msg) => { if (status.kind === kind && status.msg === msg) return; status = { kind, msg }; listeners.forEach((f) => f(status)); };
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(Model.get())); setStatus('saved', 'All changes saved in this browser'); }
    catch (e) { setStatus('error', 'Could not save: browser storage is full or blocked. Download a backup!'); }
  }
  window.Store = {
    status: () => status,
    onStatus: (f) => listeners.push(f),
    init() {
      let d = null;
      try { d = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { d = null; }
      Model.replace(d && Model.validate(d) ? d : Model.blank());
      Model.subscribe((kind) => { if (kind === 'change') save(); });
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
      save();
    },
  };
})();
