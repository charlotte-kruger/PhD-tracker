/* Data model, progress maths, archive rules, and 3-way-safe merge for multi-device sync.
   Hierarchy is strictly Project -> Goal -> Task. Every entity has an id and `u` (last-updated ms).
   Deleted ids are kept in `tomb` so a deletion on one device is not undone by another. */
(function () {
  const NOW = () => Date.now();
  const STATUSES = ['not_started', 'in_progress', 'completed'];
  const STATUS_LABEL = { not_started: 'Not started', in_progress: 'In progress', completed: 'Completed' };
  const STATUS_VALUE = { not_started: 0, in_progress: 0.5, completed: 1 };
  const PALETTE = ['#6C5CE7', '#0984E3', '#00B894', '#E17055', '#E84393', '#F39C12', '#00CEC9', '#D63031', '#2ECC71', '#8E44AD', '#FF7675', '#1E90FF'];
  const DEFAULT_CATS = [['Experiments', '#0984E3'], ['Data analysis', '#6C5CE7'], ['Writing', '#E17055'], ['Reading', '#00B894'], ['Admin', '#F39C12']];

  function blank() {
    return {
      v: 1, u: NOW(),
      settings: { u: NOW(), countdownTarget: '2027-06-01' },
      categories: DEFAULT_CATS.map(([name, color]) => ({ id: U.uid(), name, color, u: NOW() })),
      projects: [], todos: [], tomb: {},
    };
  }

  let S = blank();
  const subs = [];
  const emit = (kind) => subs.forEach((f) => f(kind));

  /* ---------- progress ---------- */
  const goalPct = (g) => (g.tasks.length ? (g.tasks.reduce((a, t) => a + STATUS_VALUE[t.status], 0) / g.tasks.length) * 100 : 0);
  function projStats(p) {
    let done = 0, total = 0, overdue = 0, soon = 0;
    p.goals.forEach((g) => g.tasks.forEach((t) => {
      total++;
      if (t.status === 'completed') done++;
      else { const d = U.diff(U.today(), t.end); if (d < 0) overdue++; else if (d <= 7) soon++; }
    }));
    return { done, total, overdue, soon, pct: total ? (done / total) * 100 : 0 };
  }

  /* ---------- normalisation (idempotent; returns true if it changed anything) ---------- */
  function normalize(s) {
    let changed = false;
    s.settings = s.settings || { u: NOW(), countdownTarget: '2027-06-01' };
    s.categories = s.categories || []; s.projects = s.projects || []; s.todos = s.todos || []; s.tomb = s.tomb || {};
    // a task id must exist in exactly one goal (guards against moves merged from two devices)
    const best = new Map();
    s.projects.forEach((p) => { p.goals = p.goals || []; p.goals.forEach((g) => { g.tasks = g.tasks || []; g.tasks.forEach((t) => {
      const cur = best.get(t.id); if (!cur || (t.u || 0) > (cur.u || 0)) best.set(t.id, t);
    }); }); });
    s.projects.forEach((p) => p.goals.forEach((g) => {
      const n = g.tasks.length; g.tasks = g.tasks.filter((t) => best.get(t.id) === t); if (n !== g.tasks.length) changed = true;
      if (g.end < g.start) { g.end = g.start; g.u = NOW(); changed = true; }
    }));
    // archive rules
    const today = U.today();
    s.projects.forEach((p) => {
      const st = projStats(p), full = st.total > 0 && st.done === st.total;
      if (full) {
        if (!p.completedOn) { p.completedOn = today; p.u = NOW(); changed = true; }
        if (!p.keepActive && !p.archived) { p.archived = true; p.archivedOn = today; p.u = NOW(); changed = true; }
      } else if (p.archived || p.keepActive || p.completedOn) {
        p.archived = false; p.keepActive = false; p.archivedOn = null; p.completedOn = null; p.u = NOW(); changed = true;
      }
    });
    return changed;
  }

  /* ---------- merge ---------- */
  const newer = (a, b) => ((a.u || 0) >= (b.u || 0) ? a : b);
  function mergeList(a, b, tomb, aPref, mergeItem) {
    const ma = new Map(a.map((x) => [x.id, x])), mb = new Map(b.map((x) => [x.id, x]));
    const out = [], seen = new Set();
    for (const it of aPref ? [...a, ...b] : [...b, ...a]) {
      if (seen.has(it.id)) continue; seen.add(it.id);
      const x = ma.get(it.id), y = mb.get(it.id);
      const m = x && y ? mergeItem(x, y) : U.clone(it);
      if ((tomb[it.id] || 0) > (m.u || 0)) continue;
      out.push(m);
    }
    return out;
  }
  function mergeStates(A, B) {
    const tomb = Object.assign({}, A.tomb);
    Object.keys(B.tomb || {}).forEach((k) => { tomb[k] = Math.max(tomb[k] || 0, B.tomb[k]); });
    const aNewer = (A.u || 0) >= (B.u || 0);
    const R = U.clone(aNewer ? A : B);
    R.tomb = tomb; R.u = Math.max(A.u || 0, B.u || 0);
    R.settings = U.clone(newer(A.settings || {}, B.settings || {}));
    const leaf = (x, y) => U.clone(newer(x, y));
    R.categories = mergeList(A.categories, B.categories, tomb, aNewer, leaf);
    R.todos = mergeList(A.todos, B.todos, tomb, aNewer, leaf);
    R.projects = mergeList(A.projects, B.projects, tomb, aNewer, (pa, pb) => {
      const pw = U.clone(newer(pa, pb)); const pn = (pa.u || 0) >= (pb.u || 0);
      pw.goals = mergeList(pa.goals, pb.goals, tomb, pn, (ga, gb) => {
        const gw = U.clone(newer(ga, gb)); const gn = (ga.u || 0) >= (gb.u || 0);
        gw.tasks = mergeList(ga.tasks, gb.tasks, tomb, gn, leaf);
        return gw;
      });
      return pw;
    });
    return R;
  }

  /* ---------- lookups ---------- */
  const P = (pid) => S.projects.find((p) => p.id === pid);
  const G = (pid, gid) => { const p = P(pid); return p && p.goals.find((g) => g.id === gid); };
  const T = (pid, gid, tid) => { const g = G(pid, gid); return g && g.tasks.find((t) => t.id === tid); };
  const touch = (...o) => o.forEach((x) => { if (x) x.u = NOW(); });
  const bury = (...ids) => ids.forEach((id) => { S.tomb[id] = NOW(); });
  function commit(fn) { fn(S); normalize(S); S.u = NOW(); emit('change'); }
  function reorder(arr, ids) {
    const m = new Map(arr.map((x) => [x.id, x]));
    const out = ids.map((i) => m.get(i)).filter(Boolean);
    arr.forEach((x) => { if (!ids.includes(x.id)) out.push(x); });
    return out;
  }

  const Model = {
    STATUSES, STATUS_LABEL, STATUS_VALUE, PALETTE,
    get: () => S,
    subscribe: (f) => subs.push(f),
    goalPct, projStats,
    project: P, goal: G, task: T,
    category: (id) => S.categories.find((c) => c.id === id),
    activeProjects: () => S.projects.filter((p) => !p.archived),
    archivedProjects: () => S.projects.filter((p) => p.archived),
    blank, merge: (remote) => mergeStates(S, remote),
    /** replace whole state (load / sync). Returns true if normalisation changed something. */
    replace(next) {
      S = next; const ch = normalize(S); emit('replace'); return ch;
    },
    normalizeNow() { const ch = normalize(S); if (ch) emit('change'); return ch; },
    validate(d) { return d && typeof d === 'object' && Array.isArray(d.projects) && Array.isArray(d.todos) && (d.v || 1) <= 1; },

    /* projects */
    addProject({ name, deadline, color }) {
      let id; commit((s) => { id = U.uid(); s.projects.push({ id, name, deadline, color, goals: [], archived: false, keepActive: false, u: NOW() }); }); return id;
    },
    updateProject(pid, patch) { commit(() => { const p = P(pid); if (p) { Object.assign(p, patch); touch(p); } }); },
    deleteProject(pid) {
      commit((s) => { const p = P(pid); if (!p) return; bury(p.id, ...p.goals.map((g) => g.id), ...p.goals.flatMap((g) => g.tasks.map((t) => t.id))); s.projects = s.projects.filter((x) => x.id !== pid); });
    },
    reorderProjects(ids) { commit((s) => { s.projects = reorder(s.projects, ids); }); },
    restoreProject(pid) { commit(() => { const p = P(pid); if (p) { p.archived = false; p.keepActive = true; p.archivedOn = null; touch(p); } }); },

    /* goals */
    addGoal(pid, { name, start, end }) {
      let id; commit(() => { const p = P(pid); id = U.uid(); p.goals.push({ id, name, start, end, tasks: [], u: NOW() }); touch(p); }); return id;
    },
    updateGoal(pid, gid, patch) { commit(() => { const g = G(pid, gid); if (g) { Object.assign(g, patch); touch(g); } }); },
    setGoalDates(pid, gid, start, end) { Model.updateGoal(pid, gid, { start, end }); },
    deleteGoal(pid, gid) {
      commit(() => { const p = P(pid), g = G(pid, gid); if (!g) return; bury(g.id, ...g.tasks.map((t) => t.id)); p.goals = p.goals.filter((x) => x.id !== gid); touch(p); });
    },
    reorderGoals(pid, ids) { commit(() => { const p = P(pid); p.goals = reorder(p.goals, ids); touch(p); }); },

    /* tasks */
    addTask(pid, gid, { name, start, end, categoryId }) {
      let id; commit(() => { const g = G(pid, gid); id = U.uid(); g.tasks.push({ id, name, start, end, categoryId: categoryId || null, legacy: null, status: 'not_started', completedOn: null, u: NOW() }); touch(g); }); return id;
    },
    updateTask(pid, gid, tid, patch) {
      commit(() => {
        const g = G(pid, gid), t = T(pid, gid, tid); if (!t) return;
        const { goalId, ...rest } = patch; Object.assign(t, rest);
        if ('categoryId' in rest && rest.categoryId) t.legacy = null;
        touch(t);
        if (goalId && goalId !== gid) { const ng = G(pid, goalId); if (ng) { g.tasks = g.tasks.filter((x) => x.id !== tid); ng.tasks.push(t); touch(g, ng); } }
      });
    },
    setStatus(pid, gid, tid, status) {
      commit(() => { const t = T(pid, gid, tid); if (!t || t.status === status) return; t.status = status; t.completedOn = status === 'completed' ? U.today() : null; touch(t); });
    },
    deleteTask(pid, gid, tid) { commit(() => { const g = G(pid, gid); if (!g) return; bury(tid); g.tasks = g.tasks.filter((t) => t.id !== tid); touch(g); }); },
    reorderTasks(pid, gid, ids) { commit(() => { const g = G(pid, gid); g.tasks = reorder(g.tasks, ids); touch(g); }); },

    /* categories */
    addCategory(name, color) { let id; commit((s) => { id = U.uid(); s.categories.push({ id, name, color, u: NOW() }); }); return id; },
    updateCategory(id, patch) { commit((s) => { const c = s.categories.find((x) => x.id === id); if (c) { Object.assign(c, patch); touch(c); } }); },
    categoryUsage(id) { let n = 0; S.projects.forEach((p) => p.goals.forEach((g) => g.tasks.forEach((t) => { if (t.categoryId === id) n++; }))); return n; },
    deleteCategory(id, mode, toId) {
      commit((s) => {
        const c = s.categories.find((x) => x.id === id); if (!c) return;
        s.projects.forEach((p) => p.goals.forEach((g) => g.tasks.forEach((t) => {
          if (t.categoryId !== id) return;
          if (mode === 'reassign') { t.categoryId = toId || null; t.legacy = null; } else { t.legacy = { name: c.name, color: c.color }; t.categoryId = null; }
          touch(t);
        })));
        s.categories = s.categories.filter((x) => x.id !== id); bury(id);
      });
    },

    /* settings */
    setCountdown(date) { commit((s) => { s.settings.countdownTarget = date; touch(s.settings); }); },

    /* to-do list (completely separate from progress maths) */
    addTodo(text) { commit((s) => { s.todos.push({ id: U.uid(), text, done: false, doneOn: null, created: U.today(), u: NOW() }); }); },
    updateTodo(id, patch) { commit((s) => { const t = s.todos.find((x) => x.id === id); if (t) { Object.assign(t, patch); touch(t); } }); },
    toggleTodo(id) {
      commit((s) => { const t = s.todos.find((x) => x.id === id); if (!t) return; t.done = !t.done; t.doneOn = t.done ? U.today() : null; touch(t); });
    },
    deleteTodo(id) { commit((s) => { bury(id); s.todos = s.todos.filter((t) => t.id !== id); }); },
    restoreTodo(item, index) { commit((s) => { delete s.tomb[item.id]; item.u = NOW(); s.todos.splice(Math.min(index, s.todos.length), 0, item); }); },
    /** reorder the (active|done) subset while leaving the other subset's slots untouched */
    reorderTodos(ids) {
      commit((s) => {
        const set = new Set(ids); const slots = []; s.todos.forEach((t, i) => { if (set.has(t.id)) slots.push(i); });
        const m = new Map(s.todos.map((t) => [t.id, t]));
        ids.forEach((id, k) => { s.todos[slots[k]] = m.get(id); });
      });
    },
  };
  window.Model = Model;
})();
