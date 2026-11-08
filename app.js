/* Charlotte's PhD – application UI: dashboard, project pages, to-do list, settings, router. */
(function () {
  const { $, $$, openModal, openForm, confirmDialog, toast, sortable } = UIC;
  const e = U.esc;
  const SL = Model.STATUS_LABEL;

  /* ---------- device-local UI state (collapsed panels, zoom) ---------- */
  const UI_KEY = 'phd.ui.v1';
  const UI = Object.assign({ collapsed: {}, zoom: {}, goalClosed: {}, archiveOpen: false, todoTab: 'active' }, (() => { try { return JSON.parse(localStorage.getItem(UI_KEY) || '{}'); } catch (x) { return {}; } })());
  const saveUI = () => { try { localStorage.setItem(UI_KEY, JSON.stringify(UI)); } catch (x) { /* ignore */ } };
  const gscroll = {};                                  // per-project horizontal scroll memory (session only)

  /* ---------- routing ---------- */
  function route() {
    const m = location.hash.match(/^#\/p\/([^/]+)(?:\/g\/([^/]+))?/);
    return m ? { page: 'project', pid: m[1], gid: m[2] || null } : { page: 'home' };
  }
  const go = (h) => { location.hash = h; };

  /* ---------- header: clock, sync chip ---------- */
  let lastDay = U.today();
  function tickClock() {
    const d = new Date();
    $('#clockDate').textContent = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()] + ', ' + U.fmt(U.iso(d));
    $('#clockTime').textContent = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (U.iso(d) !== lastDay) { lastDay = U.iso(d); renderAll(); }
  }
  function renderSync(st) {
    const b = $('#syncChip');
    b.className = 'chip sync-' + st.kind; b.title = st.msg;
    b.innerHTML = '<span class="sync-ic">' + (st.kind === 'saved' ? '✓' : '⚠') + '</span><span class="sync-tx">' + (st.kind === 'saved' ? 'Saved in this browser' : 'Save failed – download backup') + '</span>';
  }

  /* ---------- left sidebar: countdown + daily quote ---------- */
  function quoteFor(dayStr) {
    const Q = window.QUOTES || []; if (!Q.length) return null;
    // fixed shuffled order (same on every device) walked one step per day => no repeats for 400 days
    let seed = 20270601; const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const order = Q.map((_, i) => i); for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const dn = Math.floor(Date.UTC(...dayStr.split('-').map((n, i) => (i === 1 ? n - 1 : +n))) / 864e5);
    return Q[order[((dn % Q.length) + Q.length) % Q.length]];
  }
  function renderLeft() {
    const t = Model.get().settings.countdownTarget, d = U.diff(U.today(), t);
    let big, label;
    if (d > 0) { big = String(d); label = (d === 1 ? 'Day' : 'Days') + ' Until ' + U.fmt(t); }
    else if (d === 0) { big = '🎓'; label = 'Today is the day – ' + U.fmt(t); }
    else { big = '✓'; label = 'The ' + U.fmt(t) + ' deadline has arrived'; }
    const q = quoteFor(U.today());
    $('#left').innerHTML =
      '<section class="card countdown"><div class="cd-num' + (d <= 0 ? ' cd-msg' : '') + '" id="cdNum">' + big + '</div><div class="cd-label">' + e(label) + '</div></section>' +
      (q ? '<section class="card quote"><div class="q-mark">“</div><p class="q-text">' + e(q.text) + '</p><div class="q-by">— ' + e(q.author) + (q.source ? ', <i>' + e(q.source) + '</i>' : '') + '</div></section>' : '');
  }

  /* ---------- right sidebar: independent to-do list ---------- */
  let editingTodo = null;
  function renderTodo() {
    const S = Model.get(), active = S.todos.filter((t) => !t.done), done = S.todos.filter((t) => t.done).sort((a, b) => (b.doneOn || '').localeCompare(a.doneOn || ''));
    const tab = UI.todoTab;
    let body;
    if (tab === 'active') {
      body = '<form class="todo-add" id="todoAdd"><input id="todoNew" placeholder="Add an item…" maxlength="300" autocomplete="off"><button class="btn primary small" type="submit">Add</button></form><ul class="tlist" id="todoList">' +
        (active.length ? active.map((t) => '<li data-id="' + t.id + '"><span class="grip" title="Drag to reorder">⋮⋮</span><input type="checkbox" data-todo="toggle" aria-label="Mark done"><span class="ttext" data-todo="edit" title="Click to edit">' + e(t.text) + '</span><button class="icon-btn" data-todo="del" aria-label="Delete">✕</button></li>').join('') : '<li class="empty">Nothing here yet – jot something down.</li>') + '</ul>';
    } else {
      body = '<ul class="tlist done" id="todoList">' + (done.length ? done.map((t) => '<li data-id="' + t.id + '"><input type="checkbox" checked data-todo="toggle" aria-label="Move back to active list"><div class="tdone"><span class="ttext" data-todo="edit" title="Click to edit">' + e(t.text) + '</span><small>Done ' + U.fmt(t.doneOn) + '</small></div><button class="icon-btn" data-todo="toggle" title="Move back to active list" aria-label="Move back to active list">↩</button><button class="icon-btn" data-todo="del" aria-label="Delete">✕</button></li>').join('') : '<li class="empty">Completed items will appear here.</li>') + '</ul>';
    }
    const keep = document.activeElement && document.activeElement.id === 'todoNew' ? $('#todoNew').value : null;
    $('#right').innerHTML = '<section class="card todo"><h3 class="side-title">To-do list</h3><div class="tabs" role="tablist"><button role="tab" class="' + (tab === 'active' ? 'on' : '') + '" data-tab="active">To do <span class="count">' + active.length + '</span></button><button role="tab" class="' + (tab === 'done' ? 'on' : '') + '" data-tab="done">Items done <span class="count">' + done.length + '</span></button></div>' + body + '</section>';
    if (keep !== null) { const i = $('#todoNew'); i.value = keep; i.focus(); }
    if (tab === 'active') sortable($('#todoList'), 'li[data-id]', '.grip', (ids) => Model.reorderTodos(ids));
  }
  function bindTodo() {
    const R = $('#right');
    R.addEventListener('click', (ev) => {
      const tb = ev.target.closest('[data-tab]'); if (tb) { UI.todoTab = tb.dataset.tab; saveUI(); renderTodo(); return; }
      const a = ev.target.closest('[data-todo]'); if (!a) return;
      const li = a.closest('li'), id = li.dataset.id, act = a.dataset.todo;
      if (act === 'toggle') Model.toggleTodo(id);
      else if (act === 'del') {
        const S = Model.get(), idx = S.todos.findIndex((t) => t.id === id), item = U.clone(S.todos[idx]);
        Model.deleteTodo(id); toast('Item deleted', 'Undo', () => Model.restoreTodo(item, idx));
      } else if (act === 'edit') editTodo(li, id);
    });
    R.addEventListener('submit', (ev) => {
      if (ev.target.id !== 'todoAdd') return; ev.preventDefault();
      const i = $('#todoNew'), v = i.value.trim(); if (!v) return; Model.addTodo(v); $('#todoNew').focus();
    });
  }
  function editTodo(li, id) {
    const span = $('.ttext', li), t = Model.get().todos.find((x) => x.id === id); if (!t || $('input.tedit', li)) return;
    const inp = document.createElement('input'); inp.className = 'tedit'; inp.value = t.text; inp.maxLength = 300;
    span.replaceWith(inp); inp.focus(); inp.select(); editingTodo = id;
    let finished = false;
    const finish = (save) => { if (finished) return; finished = true; editingTodo = null; const v = inp.value.trim(); if (save && v && v !== t.text) Model.updateTodo(id, { text: v }); else renderTodo(); };
    inp.addEventListener('keydown', (k) => { if (k.key === 'Enter') finish(true); else if (k.key === 'Escape') finish(false); });
    inp.addEventListener('blur', () => finish(true));
  }

  /* ---------- shared fragments ---------- */
  const bar = (pct) => '<div class="bar"><i style="width:' + pct + '%"></i></div>';
  function catChip(t) {
    if (t.categoryId) { const c = Model.category(t.categoryId); if (c) return '<span class="cat" style="--cc:' + c.color + '">' + e(c.name) + '</span>'; }
    if (t.legacy) return '<span class="cat legacy" style="--cc:#868E96" title="This category was deleted">' + e(t.legacy.name) + ' (legacy)</span>';
    return '<span class="cat none">No category</span>';
  }
  function projDeadline(p) {
    const d = U.diff(U.today(), p.deadline);
    return 'Due ' + U.fmt(p.deadline) + (p.archived ? '' : ' · ' + (d < 0 ? U.plural(-d, 'day') + ' past' : d === 0 ? 'today' : U.plural(d, 'day') + ' left'));
  }
  function chips(st) {
    return (st.overdue ? '<span class="pill dl-red dl-over">' + st.overdue + ' overdue</span>' : '') + (st.soon ? '<span class="pill dl-red">' + st.soon + ' due ≤ 7 days</span>' : '');
  }
  const pvars = (p) => '--c:' + p.color + ';--lt:' + U.lighten(p.color, 0.78) + ';--mid:' + U.lighten(p.color, 0.55);

  /* ---------- dashboard ---------- */
  function projectCard(p) {
    const st = Model.projStats(p), closed = UI.collapsed[p.id], zoom = UI.zoom[p.id] || 'week';
    const zb = (z, l) => '<button class="seg-b' + (zoom === z ? ' on' : '') + '" data-act="zoom" data-pid="' + p.id + '" data-z="' + z + '">' + l + '</button>';
    return '<section class="pcard' + (closed ? ' closed' : '') + '" data-id="' + p.id + '" style="' + pvars(p) + '">' +
      '<div class="phead" data-act="toggleProj" data-pid="' + p.id + '"><span class="grip" data-act="noop" title="Drag to reorder projects">⋮⋮</span><span class="chev">▾</span><span class="pdot"></span>' +
      '<div class="pt"><div class="pname">' + e(p.name) + '</div><div class="pmeta">' + e(projDeadline(p)) + chips(st) + '</div></div>' +
      '<div class="pprog" title="' + st.done + ' of ' + st.total + ' tasks completed">' + bar(st.pct) + '<b>' + U.pct(st.pct) + '</b><small>' + st.done + '/' + st.total + ' tasks</small></div>' +
      '<div class="pbtns"><button class="btn small" data-act="openProject" data-pid="' + p.id + '">Open</button><button class="icon-btn" data-act="editProject" data-pid="' + p.id + '" title="Edit project" aria-label="Edit project">✎</button><button class="icon-btn" data-act="deleteProject" data-pid="' + p.id + '" title="Delete project" aria-label="Delete project">🗑</button></div></div>' +
      '<div class="pbody"><div class="ptool"><div class="seg-g">' + zb('week', 'Weekly') + zb('month', 'Monthly') + zb('year', 'Yearly') + '</div><button class="btn small" data-act="ganttToday" data-pid="' + p.id + '">Jump to today</button>' +
      '<span class="hint">Drag a bar’s edge to change its dates · click a bar to open the goal</span></div>' +
      (p.goals.length ? Gantt.build(p, zoom) : '<div class="gempty">No goals yet. <button class="btn small primary" data-act="openProject" data-pid="' + p.id + '">Open project to add goals</button></div>') + '</div></section>';
  }
  function archivedRow(p) {
    const st = Model.projStats(p);
    return '<div class="arow" style="' + pvars(p) + '"><span class="pdot"></span><div class="pt"><div class="pname">' + e(p.name) + '</div><div class="pmeta">Completed ' + (p.completedOn ? U.fmt(p.completedOn) : '') + ' · ' + st.done + '/' + st.total + ' tasks · ' + U.plural(p.goals.length, 'goal') + '</div></div><b>' + U.pct(st.pct) + '</b>' +
      '<button class="btn small" data-act="openProject" data-pid="' + p.id + '">View</button><button class="btn small primary" data-act="restoreProject" data-pid="' + p.id + '">Restore</button></div>';
  }
  function renderHome() {
    const act = Model.activeProjects(), arch = Model.archivedProjects();
    let h = '<div class="page-head"><h1>Projects</h1><button class="btn primary" data-act="newProject">+ New project</button></div>';
    h += act.length ? '<div id="plist">' + act.map(projectCard).join('') + '</div>' :
      '<div class="card empty-state"><h3>' + (Model.get().projects.length ? 'All projects are complete 🎉' : 'Start your first project') + '</h3><p>' + (Model.get().projects.length ? 'Completed projects live in the archive below. Create a new project to keep going.' : 'Create a project, add goals with start and end dates, then break each goal into tasks. Goals appear here as bars on a Gantt chart.') + '</p><button class="btn primary" data-act="newProject">+ New project</button></div>';
    h += '<section class="archive"><button class="arch-head" data-act="toggleArchive"><span class="chev' + (UI.archiveOpen ? '' : ' r') + '">▾</span> Archive <span class="count">' + arch.length + '</span></button>' +
      (UI.archiveOpen ? '<div class="arch-body">' + (arch.length ? arch.map(archivedRow).join('') : '<p class="muted">Projects that reach 100% completion move here automatically. Nothing is ever deleted by archiving.</p>') + '</div>' : '') + '</section>';
    $('#main').innerHTML = h;
    $$('.gscroll').forEach((sc) => {
      const pid = sc.closest('.gantt').dataset.pid, z = UI.zoom[pid] || 'week', key = pid + z;
      sc.scrollLeft = gscroll[key] != null ? gscroll[key] : Math.max(0, +sc.dataset.todayx - 140);
      sc.addEventListener('scroll', () => { gscroll[key] = sc.scrollLeft; });
    });
    sortable($('#plist'), '.pcard', '.grip', (ids) => Model.reorderProjects(ids.concat(Model.get().projects.filter((p) => p.archived).map((p) => p.id))));
  }

  /* ---------- project page ---------- */
  function taskRow(p, g, t) {
    const dl = U.deadline(t);
    const seg = Model.STATUSES.map((s) => '<button class="stat s-' + s + (t.status === s ? ' on' : '') + '" data-act="setStatus" data-gid="' + g.id + '" data-tid="' + t.id + '" data-st="' + s + '" aria-pressed="' + (t.status === s) + '">' + SL[s] + '</button>').join('');
    return '<div class="trow" data-id="' + t.id + '"><span class="grip" title="Drag to reorder">⋮⋮</span><div class="tmain"><div class="tname' + (t.status === 'completed' ? ' done' : '') + '">' + e(t.name) + '</div>' +
      '<div class="tmeta">' + catChip(t) + '<span class="tdates">' + U.fmtShort(t.start) + ' → ' + U.fmt(t.end) + '</span><span class="dl ' + dl.cls + '">' + e(dl.label) + '</span></div></div>' +
      '<div class="seg3" role="group" aria-label="Status">' + seg + '</div>' +
      '<div class="tbtns"><button class="icon-btn" data-act="editTask" data-gid="' + g.id + '" data-tid="' + t.id + '" title="Edit task" aria-label="Edit task">✎</button><button class="icon-btn" data-act="deleteTask" data-gid="' + g.id + '" data-tid="' + t.id + '" title="Delete task" aria-label="Delete task">🗑</button></div></div>';
  }
  function goalCard(p, g) {
    const pct = Model.goalPct(g), closed = UI.goalClosed[g.id], done = g.tasks.filter((t) => t.status === 'completed').length;
    const od = g.tasks.filter((t) => t.status !== 'completed' && U.diff(U.today(), t.end) < 0).length;
    return '<section class="gcard' + (closed ? ' closed' : '') + '" data-id="' + g.id + '" id="goal-' + g.id + '"><div class="ghead" data-act="toggleGoal" data-gid="' + g.id + '"><span class="grip" data-act="noop" title="Drag to reorder goals">⋮⋮</span><span class="chev">▾</span>' +
      '<div class="pt"><div class="pname">' + e(g.name) + '</div><div class="pmeta">' + U.fmt(g.start) + ' → ' + U.fmt(g.end) + (od ? '<span class="pill dl-red dl-over">' + od + ' overdue</span>' : '') + '</div></div>' +
      '<div class="pprog" title="Average of task weights: not started 0%, in progress 50%, completed 100%">' + bar(pct) + '<b>' + U.pct(pct) + '</b><small>' + done + '/' + g.tasks.length + ' tasks done</small></div>' +
      '<div class="pbtns"><button class="icon-btn" data-act="editGoal" data-gid="' + g.id + '" title="Edit goal" aria-label="Edit goal">✎</button><button class="icon-btn" data-act="deleteGoal" data-gid="' + g.id + '" title="Delete goal" aria-label="Delete goal">🗑</button></div></div>' +
      '<div class="gbody2"><div class="tasks">' + (g.tasks.length ? g.tasks.map((t) => taskRow(p, g, t)).join('') : '<div class="muted pad">No tasks yet.</div>') + '</div><button class="btn small" data-act="addTask" data-gid="' + g.id + '">+ Add task</button></div></section>';
  }
  function renderProject(r) {
    const p = Model.project(r.pid);
    if (!p) { $('#main').innerHTML = '<div class="card empty-state"><h3>Project not found</h3><p>It may have been deleted on another device.</p><a class="btn primary" href="#/">Back to dashboard</a></div>'; return; }
    const st = Model.projStats(p);
    $('#main').innerHTML = '<div class="proj-page" style="' + pvars(p) + '"><a class="back" href="#/">← Back to dashboard</a>' +
      '<div class="proj-hero card"><div class="ph-top"><span class="pdot big"></span><div class="pt"><h1>' + e(p.name) + (p.archived ? ' <span class="pill arch">Archived</span>' : '') + '</h1><div class="pmeta">' + e(projDeadline(p)) + chips(st) + '</div></div>' +
      '<div class="pbtns"><button class="btn small" data-act="editProject" data-pid="' + p.id + '">Edit project</button><button class="btn small danger-o" data-act="deleteProject" data-pid="' + p.id + '">Delete</button>' + (p.archived ? '<button class="btn small primary" data-act="restoreProject" data-pid="' + p.id + '">Restore to active</button>' : '') + '</div></div>' +
      '<div class="ph-prog">' + bar(st.pct) + '<b>' + U.pct(st.pct) + '</b><span>' + st.done + ' of ' + st.total + ' tasks completed <small>(in-progress tasks do not count here)</small></span></div></div>' +
      '<div class="page-head"><h2>Goals</h2><button class="btn primary" data-act="addGoal">+ Add goal</button></div>' +
      '<div id="goalList">' + (p.goals.length ? p.goals.map((g) => goalCard(p, g)).join('') : '<div class="card empty-state"><h3>No goals yet</h3><p>Add a goal with a start and end date, then add its tasks.</p></div>') + '</div></div>';
    sortable($('#goalList'), '.gcard', '.grip', (ids) => Model.reorderGoals(p.id, ids));
    p.goals.forEach((g) => sortable($('#goal-' + g.id + ' .tasks'), '.trow', '.grip', (ids) => Model.reorderTasks(p.id, g.id, ids)));
    if (r.gid && state.scrollGoal !== r.gid) { state.scrollGoal = r.gid; const el = $('#goal-' + r.gid); if (el) { UI.goalClosed[r.gid] = false; el.classList.remove('closed'); setTimeout(() => { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); el.classList.add('flash'); }, 30); } }
  }

  /* ---------- rendering coordinator ---------- */
  const state = { lastRoute: '', scrollGoal: null };
  function renderMain() {
    const r = route(), key = location.hash, y = window.scrollY;
    if (key !== state.lastRoute) state.scrollGoal = null;
    r.page === 'project' ? renderProject(r) : renderHome();
    if (key === state.lastRoute) window.scrollTo(0, y); else if (!r.gid) window.scrollTo(0, 0);
    state.lastRoute = key;
  }
  function renderAll() { renderMain(); renderLeft(); if (editingTodo === null) renderTodo(); }

  /* ---------- forms ---------- */
  function nextColor() { const used = Model.get().projects.map((p) => p.color); return Model.PALETTE.find((c) => !used.includes(c)) || Model.PALETTE[used.length % Model.PALETTE.length]; }
  function projectForm(p) {
    openForm({
      title: p ? 'Edit project' : 'New project', submit: p ? 'Save changes' : 'Create project',
      fields: [{ name: 'name', label: 'Project name', value: p ? p.name : '', maxlength: 120 }, { name: 'deadline', label: 'Final project deadline', type: 'date', value: p ? p.deadline : Model.get().settings.countdownTarget }, { name: 'color', label: 'Project colour', type: 'color', value: p ? p.color : nextColor() }],
      onSubmit(v) {
        if (p) Model.updateProject(p.id, { name: v.name, deadline: v.deadline, color: v.color });
        else { const id = Model.addProject(v); UI.collapsed[id] = false; }
      },
    });
  }
  function goalForm(pid, g) {
    const p = Model.project(pid), today = U.today();
    openForm({
      title: g ? 'Edit goal' : 'Add goal', submit: g ? 'Save changes' : 'Add goal',
      fields: [{ name: 'name', label: 'Goal name', value: g ? g.name : '', maxlength: 140 }, { name: 'start', label: 'Start date', type: 'date', value: g ? g.start : today, half: true }, { name: 'end', label: 'End date / deadline', type: 'date', value: g ? g.end : (p.deadline > today ? p.deadline : today), half: true }],
      onSubmit(v) {
        if (v.end < v.start) return 'The end date must be on or after the start date.';
        if (g) Model.updateGoal(pid, g.id, v); else Model.addGoal(pid, v);
      },
    });
  }
  function taskForm(pid, gid, t) {
    const p = Model.project(pid), g = Model.goal(pid, gid), S = Model.get(), today = U.today();
    const cats = [{ value: '', label: '— No category —' }].concat(S.categories.map((c) => ({ value: c.id, label: c.name })));
    const catVal = t ? (t.categoryId && Model.category(t.categoryId) ? t.categoryId : '') : '';
    let start = today < g.start ? g.start : today > g.end ? g.end : today;
    const fields = [{ name: 'name', label: 'Task name', value: t ? t.name : '', maxlength: 160 }];
    if (t && p.goals.length > 1) fields.push({ name: 'goalId', label: 'Goal', type: 'select', value: gid, options: p.goals.map((x) => ({ value: x.id, label: x.name })) });
    fields.push({ name: 'categoryId', label: 'Category', type: 'select', value: catVal, options: cats, required: false },
      { name: 'start', label: 'Start date', type: 'date', value: t ? t.start : start, half: true }, { name: 'end', label: 'Deadline', type: 'date', value: t ? t.end : g.end, half: true });
    openForm({
      title: t ? 'Edit task' : 'Add task to “' + g.name + '”', submit: t ? 'Save changes' : 'Add task', fields,
      extra: t && t.legacy && !t.categoryId ? '<p class="muted">Previous category: ' + e(t.legacy.name) + ' (deleted). Pick a category above to replace it.</p>' : '',
      onSubmit(v) {
        if (v.end < v.start) return 'The deadline must be on or after the start date.';
        const patch = { name: v.name, start: v.start, end: v.end };
        if (v.categoryId || !(t && t.legacy)) patch.categoryId = v.categoryId || null;
        if (t) { if (v.goalId) patch.goalId = v.goalId; Model.updateTask(pid, gid, t.id, patch); }
        else Model.addTask(pid, gid, patch);
      },
    });
  }

  /* ---------- actions (click delegation on #main) ---------- */
  const A = {
    noop() {},
    newProject() { projectForm(null); },
    toggleProj(d) { UI.collapsed[d.pid] = !UI.collapsed[d.pid]; saveUI(); const c = $('.pcard[data-id="' + d.pid + '"]'); c.classList.toggle('closed', UI.collapsed[d.pid]);
      const sc = $('.gscroll', c); if (sc && !UI.collapsed[d.pid]) sc.scrollLeft = gscroll[d.pid + (UI.zoom[d.pid] || 'week')] != null ? gscroll[d.pid + (UI.zoom[d.pid] || 'week')] : Math.max(0, +sc.dataset.todayx - 140); },
    openProject(d) { go('#/p/' + d.pid); },
    editProject(d) { projectForm(Model.project(d.pid)); },
    async deleteProject(d) {
      const p = Model.project(d.pid), st = Model.projStats(p);
      const ok = await confirmDialog({ title: 'Delete project?', message: 'This permanently deletes <b>' + e(p.name) + '</b> with ' + U.plural(p.goals.length, 'goal') + ' and ' + U.plural(st.total, 'task') + '. This cannot be undone. (Completed projects are archived automatically – only delete if you really want it gone.)', confirm: 'Delete project' });
      if (ok) { Model.deleteProject(d.pid); if (route().page === 'project') go('#/'); }
    },
    zoom(d) { UI.zoom[d.pid] = d.z; delete gscroll[d.pid + d.z]; saveUI(); renderMain(); },
    ganttToday(d) { const sc = $('.gantt[data-pid="' + d.pid + '"] .gscroll'); if (sc) sc.scrollTo({ left: Math.max(0, +sc.dataset.todayx - sc.clientWidth / 2), behavior: 'smooth' }); },
    toggleArchive() { UI.archiveOpen = !UI.archiveOpen; saveUI(); renderMain(); },
    restoreProject(d) { Model.restoreProject(d.pid); toast('Project restored to active projects'); },
    addGoal() { goalForm(route().pid, null); },
    editGoal(d) { goalForm(route().pid, Model.goal(route().pid, d.gid)); },
    async deleteGoal(d) {
      const g = Model.goal(route().pid, d.gid);
      const ok = await confirmDialog({ title: 'Delete goal?', message: 'This permanently deletes the goal <b>' + e(g.name) + '</b> and its ' + U.plural(g.tasks.length, 'task') + '. Other goals are not affected.', confirm: 'Delete goal' });
      if (ok) Model.deleteGoal(route().pid, d.gid);
    },
    toggleGoal(d) { UI.goalClosed[d.gid] = !UI.goalClosed[d.gid]; saveUI(); $('#goal-' + d.gid).classList.toggle('closed', !!UI.goalClosed[d.gid]); },
    addTask(d) { taskForm(route().pid, d.gid, null); },
    editTask(d) { taskForm(route().pid, d.gid, Model.task(route().pid, d.gid, d.tid)); },
    async deleteTask(d) {
      const t = Model.task(route().pid, d.gid, d.tid);
      const ok = await confirmDialog({ title: 'Delete task?', message: 'Delete the task <b>' + e(t.name) + '</b>? The goal and project progress will be recalculated.', confirm: 'Delete task' });
      if (ok) Model.deleteTask(route().pid, d.gid, d.tid);
    },
    setStatus(d) { Model.setStatus(route().pid, d.gid, d.tid, d.st); },
  };
  function bindMain() {
    $('#main').addEventListener('click', (ev) => {
      const el = ev.target.closest('[data-act]'); if (!el) return;
      if (el.dataset.act === 'noop') { ev.stopPropagation(); return; }
      A[el.dataset.act](el.dataset, ev);
    });
    Gantt.bind($('#main'), (pid, gid) => go('#/p/' + pid + '/g/' + gid));
  }

  /* ---------- settings ---------- */
  let settingsModal = null;
  function settingsHTML() {
    const S = Model.get();
    const pr = S.projects.map((p) => '<div class="srow" data-pid="' + p.id + '"><span class="pdot" style="background:' + p.color + '"></span><span class="sname">' + e(p.name) + (p.archived ? ' <small class="muted">(archived)</small>' : '') + '</span>' + UIC.swatches('c_' + p.id, p.color) + '</div>').join('') || '<p class="muted">No projects yet.</p>';
    const cats = S.categories.map((c) => '<div class="srow" data-cid="' + c.id + '"><input type="color" class="cc" value="' + c.color + '" aria-label="Colour"><input class="cn" value="' + e(c.name) + '" maxlength="40" aria-label="Category name"><small class="muted">' + U.plural(Model.categoryUsage(c.id), 'task') + '</small><button class="icon-btn" data-s="delcat" aria-label="Delete category">🗑</button></div>').join('') || '<p class="muted">No categories yet.</p>';
    const st = Store.status();
    const sync = '<div class="sync-box sync-' + st.kind + '"><b>' + e(st.msg) + '</b><div class="muted">Your data lives in this browser on this computer. Download an Excel file or a backup whenever you like; clearing browser data or using another browser/computer starts empty unless you restore a backup.</div></div>' +
      '<div class="btn-row"><button class="btn small primary" data-s="xlsx">Export to Excel</button><button class="btn small" data-s="bkp">Download JSON backup</button><button class="btn small" data-s="imp">Restore from backup…</button><input type="file" id="impFile" accept=".json,application/json" hidden></div>';
    return '<section class="s-sec"><h3>Project colours</h3><p class="muted">Changes update the Gantt charts immediately.</p>' + pr + '</section>' +
      '<section class="s-sec"><h3>Task categories</h3>' + cats + '<div class="srow add"><input type="color" id="newCatColor" class="cc" value="#0984E3" aria-label="New category colour"><input id="newCatName" placeholder="New category name" maxlength="40"><button class="btn small primary" data-s="addcat">Add category</button></div></section>' +
      '<section class="s-sec"><h3>Countdown</h3><div class="srow"><input type="date" id="cdDate" value="' + S.settings.countdownTarget + '"><button class="btn small primary" data-s="savecd">Save date</button><button class="btn small" data-s="resetcd">Reset to Jun 1, 2027</button></div></section>' +
      '<section class="s-sec"><h3>Data &amp; backup</h3>' + sync + '</section>';
  }
  function openSettings() {
    settingsModal = openModal({ title: 'Settings', html: settingsHTML(), wide: true, onClose: () => { settingsModal = null; } });
    const m = settingsModal;
    const refresh = () => { if (settingsModal !== m) return; const sy = m.body.scrollTop; m.body.innerHTML = settingsHTML(); m.body.scrollTop = sy; };
    m.refresh = refresh;
    UIC.bindSwatches(m.body, (name, color) => { Model.updateProject(name.slice(2), { color }); const row = m.body.querySelector('[data-pid="' + name.slice(2) + '"] .pdot'); if (row) row.style.background = color; });
    m.body.addEventListener('change', (ev) => {
      const row = ev.target.closest('[data-cid]'); if (!row) return; const id = row.dataset.cid;
      if (ev.target.classList.contains('cn')) { const v = ev.target.value.trim(); if (v) Model.updateCategory(id, { name: v }); else refresh(); }
      if (ev.target.classList.contains('cc')) Model.updateCategory(id, { color: ev.target.value });
    });
    m.body.addEventListener('click', async (ev) => {
      const b = ev.target.closest('[data-s]'); if (!b) return; const a = b.dataset.s;
      if (a === 'addcat') { const n = $('#newCatName', m.body).value.trim(); if (!n) { $('#newCatName', m.body).focus(); return; } Model.addCategory(n, $('#newCatColor', m.body).value); refresh(); }
      else if (a === 'delcat') {
        const id = b.closest('[data-cid]').dataset.cid, c = Model.category(id), n = Model.categoryUsage(id);
        if (!n) { if (await confirmDialog({ title: 'Delete category?', message: 'Delete the category <b>' + e(c.name) + '</b>? No tasks use it.', confirm: 'Delete category' })) { Model.deleteCategory(id, 'legacy'); refresh(); } return; }
        const others = Model.get().categories.filter((x) => x.id !== id);
        const extra = '<div class="radio-box"><label><input type="radio" name="cm" value="reassign" checked> Reassign those tasks to: <select id="cmTo"><option value="">— No category —</option>' + others.map((x) => '<option value="' + x.id + '">' + e(x.name) + '</option>').join('') + '</select></label><label><input type="radio" name="cm" value="legacy"> Keep the old name on those tasks as a grey “legacy” tag</label></div>';
        const res = await confirmDialog({ title: 'Delete category?', message: U.plural(n, 'task') + ' use <b>' + e(c.name) + '</b>. No task information will be lost – choose what happens to them:', confirm: 'Delete category', extraHTML: extra });
        if (res && res.querySelector) { const mode = res.querySelector('input[name=cm]:checked').value, to = res.querySelector('#cmTo').value; Model.deleteCategory(id, mode, to); refresh(); }
      }
      else if (a === 'savecd') { const v = $('#cdDate', m.body).value; if (v) { Model.setCountdown(v); toast('Countdown date updated'); } }
      else if (a === 'resetcd') { Model.setCountdown('2027-06-01'); refresh(); }
      else if (a === 'xlsx') ExportXLSX();
      else if (a === 'bkp') downloadBackup();
      else if (a === 'imp') $('#impFile', m.body).click();
    });
    m.body.addEventListener('change', (ev) => {
      if (ev.target.id !== 'impFile' || !ev.target.files[0]) return;
      const f = ev.target.files[0], rd = new FileReader();
      rd.onload = async () => {
        try {
          const d = JSON.parse(rd.result); if (!Model.validate(d)) throw new Error('bad');
          if (await confirmDialog({ title: 'Restore from backup?', message: 'This replaces everything currently in the app with the backup (' + U.plural(d.projects.length, 'project') + '). Download a backup of the current data first if unsure.', confirm: 'Replace data' })) { d.u = Date.now(); Model.replace(d); Model.normalizeNow(); Model.get().u = Date.now(); Model.replace(Model.get()); toast('Backup restored'); refresh(); }
        } catch (x) { toast('That file is not a valid Charlotte’s PhD backup.'); }
      };
      rd.readAsText(f);
    });
  }
  function downloadBackup() {
    const blob = new Blob([JSON.stringify(Model.get(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'charlottes-phd-backup-' + U.today() + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  /* ---------- boot ---------- */
  function boot() {
    Store.onStatus((st) => { renderSync(st); if (settingsModal) settingsModal.refresh(); });
    renderSync(Store.status());
    Store.init();
    bindMain(); bindTodo();
    Model.subscribe((kind) => {
      if (kind === 'replace' || kind === 'change') {
        if (route().page === 'project' && !Model.project(route().pid) && kind === 'change') { go('#/'); return; }
        renderAll();
      }
    });
    window.addEventListener('hashchange', () => { renderMain(); });
    $('#btnSettings').addEventListener('click', openSettings);
    $('#btnExport').addEventListener('click', () => ExportXLSX());
    $('#syncChip').addEventListener('click', openSettings);
    Model.normalizeNow();
    renderAll(); tickClock(); setInterval(tickClock, 1000);
    window.PHD_READY = true;
  }
  document.addEventListener('DOMContentLoaded', boot);
})();
