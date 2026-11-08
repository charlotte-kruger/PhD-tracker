/* Excel export (SheetJS). Sheets keep the Project -> Goal -> Task relationship via name columns. */
(function () {
  const serial = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) / 864e5 + 25569; };
  const D = (s) => (s ? { t: 'n', v: serial(s), z: 'yyyy-mm-dd' } : '');
  const P = (x) => ({ t: 'n', v: Math.round(x * 10) / 1000, z: '0.0%' });
  const SL = Model.STATUS_LABEL;

  function exportExcel() {
    const S = Model.get();
    const proj = [['Project', 'Deadline', 'Completion % (completed tasks / all tasks)', 'Completed tasks', 'Total tasks', 'Goals', 'Archived', 'Completed on']];
    const goals = [['Project', 'Goal', 'Start date', 'End date', 'Completion % (avg of task weights)', 'Completed tasks', 'Total tasks']];
    const tasks = [['Project', 'Goal', 'Task', 'Category', 'Start date', 'Deadline', 'Status', 'Completed on', 'Deadline status']];
    S.projects.forEach((p) => {
      const st = Model.projStats(p);
      proj.push([p.name, D(p.deadline), P(st.pct), st.done, st.total, p.goals.length, p.archived ? 'Yes' : 'No', D(p.completedOn)]);
      p.goals.forEach((g) => {
        goals.push([p.name, g.name, D(g.start), D(g.end), P(Model.goalPct(g)), g.tasks.filter((t) => t.status === 'completed').length, g.tasks.length]);
        g.tasks.forEach((t) => {
          const cat = t.categoryId ? (Model.category(t.categoryId) || {}).name : (t.legacy ? t.legacy.name + ' (legacy)' : '');
          tasks.push([p.name, g.name, t.name, cat || '', D(t.start), D(t.end), SL[t.status], D(t.completedOn), U.deadline(t).label]);
        });
      });
    });
    const todo = [['Item', 'Status', 'Added', 'Completed on']];
    S.todos.forEach((t) => todo.push([t.text, t.done ? 'Done' : 'Open', D(t.created), D(t.doneOn)]));

    const wb = XLSX.utils.book_new();
    const add = (name, rows, widths) => { const ws = XLSX.utils.aoa_to_sheet(rows); ws['!cols'] = widths.map((w) => ({ wch: w })); XLSX.utils.book_append_sheet(wb, ws, name); };
    add('Projects', proj, [30, 12, 22, 14, 12, 8, 10, 14]);
    add('Goals', goals, [30, 34, 12, 12, 22, 14, 12]);
    add('Tasks', tasks, [28, 30, 40, 18, 12, 12, 13, 14, 20]);
    add('To-do list', todo, [50, 10, 12, 14]);
    XLSX.writeFile(wb, 'Charlottes-PhD-' + U.today() + '.xlsx');
  }
  window.ExportXLSX = exportExcel;
})();
