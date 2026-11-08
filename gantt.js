/* Per-project Gantt chart: one bar per goal (progress shown inside the bar), today marker,
   zoom (week/month/year), tooltips, click-through, and drag-to-resize start/end dates. */
(function () {
  const PPD = { week: 22, month: 5, year: 1.3 };     // pixels per day for each zoom level
  const ROW = 38, H1 = 22, H2 = 22, HEAD = H1 + H2;
  const e = U.esc;

  function monthStarts(rs, re) {
    const out = []; const d = U.parse(rs); d.setDate(1);
    while (U.iso(d) <= re) { out.push(U.iso(d)); d.setMonth(d.getMonth() + 1); }
    return out;
  }

  function build(p, zoom) {
    const ppd = PPD[zoom] || PPD.week;
    const today = U.today();
    let minS = today, maxE = today;
    p.goals.forEach((g) => { if (g.start < minS) minS = g.start; if (g.end > maxE) maxE = g.end; });
    if (p.deadline > maxE) maxE = p.deadline;
    let rs = U.addDays(minS, -14);
    rs = U.addDays(rs, -((U.parse(rs).getDay() + 6) % 7));          // align to Monday
    const re = U.addDays(maxE, 28);
    const days = U.diff(rs, re) + 1, W = Math.round(days * ppd), x = (d) => U.diff(rs, d) * ppd;
    const bodyH = Math.max(p.goals.length, 1) * ROW;

    // header tiers + grid lines
    let t1 = '', t2 = '', lines = '';
    const cell = (cls, l, w, label) => '<div class="' + cls + '" style="left:' + l + 'px;width:' + w + 'px"><span>' + e(label) + '</span></div>';
    const months = monthStarts(rs, re);
    const monthEnd = (m) => { const d = U.parse(m); d.setMonth(d.getMonth() + 1); return U.iso(d); };
    if (zoom === 'week') {
      months.forEach((m) => { const l = Math.max(0, x(m)), r = Math.min(W, x(monthEnd(m))); const d = U.parse(m); t1 += cell('hc1', l, r - l, U.MON[d.getMonth()] + ' ' + d.getFullYear()); });
      for (let d = rs; d <= re; d = U.addDays(d, 7)) { t2 += cell('hc2', x(d), 7 * ppd, U.fmtShort(d)); lines += '<i class="gline" style="left:' + x(d) + 'px"></i>'; }
    } else {
      const years = []; months.forEach((m) => { const y = U.parse(m).getFullYear(); if (!years.includes(y)) years.push(y); });
      years.forEach((y) => { const l = Math.max(0, x(y + '-01-01')), r = Math.min(W, x((y + 1) + '-01-01')); t1 += cell('hc1', l, r - l, String(y)); });
      if (zoom === 'month') {
        months.forEach((m) => { const l = Math.max(0, x(m)), r = Math.min(W, x(monthEnd(m))); t2 += cell('hc2', l, r - l, ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][U.parse(m).getMonth()]); lines += '<i class="gline" style="left:' + l + 'px"></i>'; });
      } else {
        months.filter((m) => [0, 3, 6, 9].includes(U.parse(m).getMonth())).forEach((m) => {
          const l = Math.max(0, x(m)), d = U.parse(m); const n = new Date(d.getFullYear(), d.getMonth() + 3, 1);
          const r = Math.min(W, x(U.iso(n))); t2 += cell('hc2', l, r - l, 'Q' + (d.getMonth() / 3 + 1)); lines += '<i class="gline" style="left:' + l + 'px"></i>';
        });
      }
    }

    let bars = '', labels = '';
    p.goals.forEach((g, i) => {
      const pct = Model.goalPct(g), l = x(g.start), w = Math.max(14, (U.diff(g.start, g.end) + 1) * ppd);
      bars += '<div class="gbar" data-gid="' + g.id + '" data-s="' + g.start + '" data-e="' + g.end + '" style="left:' + l + 'px;width:' + w + 'px;top:' + (i * ROW + 8) + 'px">' +
        '<div class="gfill" style="width:' + pct + '%"></div><span class="glab">' + U.pct(pct) + '</span>' +
        '<i class="hnd hl" data-side="l" title="Drag to change start date"></i><i class="hnd hr" data-side="r" title="Drag to change deadline"></i></div>';
      labels += '<div class="glabel" data-gid="' + g.id + '" title="' + e(g.name) + '">' + e(g.name) + '</div>';
      lines += '<i class="growline" style="top:' + ((i + 1) * ROW) + 'px"></i>';
    });
    if (!p.goals.length) labels = '<div class="glabel empty">No goals yet</div>';

    const tx = Math.round(x(today) + ppd / 2);
    const dl = Math.round(x(p.deadline) + ppd);
    const inner = '<div class="ginner" style="width:' + W + 'px;height:' + (HEAD + bodyH) + 'px">' +
      '<div class="ghead1" style="height:' + H1 + 'px">' + t1 + '</div><div class="ghead2" style="top:' + H1 + 'px;height:' + H2 + 'px">' + t2 + '</div>' +
      '<div class="gbody" style="top:' + HEAD + 'px;height:' + bodyH + 'px">' + lines + bars + '</div>' +
      '<div class="gdead" style="left:' + dl + 'px" title="Project deadline: ' + U.fmt(p.deadline) + '"></div>' +
      '<div class="gtoday" style="left:' + tx + 'px" title="Today: ' + U.fmt(today) + '"><b>Today</b></div></div>';
    return '<div class="gantt" data-pid="' + p.id + '"><div class="glabels"><div class="gcorner" style="height:' + HEAD + 'px"></div>' + labels + '</div>' +
      '<div class="gscroll" data-ppd="' + ppd + '" data-rs="' + rs + '" data-todayx="' + tx + '">' + inner + '</div></div>';
  }

  /* ---------- interaction (event delegation on a root element) ---------- */
  let tip = null, dragged = false;
  function tooltip(html, ev) {
    if (!tip) { tip = document.createElement('div'); tip.className = 'gtip'; document.body.appendChild(tip); }
    tip.innerHTML = html; tip.style.display = 'block';
    const r = tip.getBoundingClientRect();
    tip.style.left = Math.min(window.innerWidth - r.width - 8, ev.clientX + 14) + 'px';
    tip.style.top = Math.min(window.innerHeight - r.height - 8, ev.clientY + 16) + 'px';
  }
  const hideTip = () => { if (tip) tip.style.display = 'none'; };
  function tipHTML(pid, gid, s, en) {
    const g = Model.goal(pid, gid); if (!g) return '';
    const done = g.tasks.filter((t) => t.status === 'completed').length;
    return '<b>' + e(g.name) + '</b><div>' + U.fmt(s || g.start) + ' → ' + U.fmt(en || g.end) + ' (' + U.plural(U.diff(s || g.start, en || g.end) + 1, 'day') + ')</div>' +
      '<div>' + U.pct(Model.goalPct(g)) + ' complete · ' + done + '/' + g.tasks.length + ' tasks done</div>';
  }

  function bind(root, nav) {
    root.addEventListener('mousemove', (ev) => {
      if (document.body.classList.contains('dragging-gantt')) return;
      const bar = ev.target.closest('.gbar'); if (!bar) { hideTip(); return; }
      const pid = bar.closest('.gantt').dataset.pid; tooltip(tipHTML(pid, bar.dataset.gid), ev);
    });
    root.addEventListener('mouseleave', hideTip);
    root.addEventListener('click', (ev) => {
      const bar = ev.target.closest('.gbar'), lab = ev.target.closest('.glabel[data-gid]');
      const hit = bar || lab; if (!hit || dragged) return;
      nav(hit.closest('.gantt').dataset.pid, hit.dataset.gid);
    });
    root.addEventListener('pointerdown', (ev) => {
      const h = ev.target.closest('.hnd'); if (!h) return;
      ev.preventDefault(); ev.stopPropagation();
      const bar = h.closest('.gbar'), sc = h.closest('.gscroll'), pid = h.closest('.gantt').dataset.pid;
      const ppd = +sc.dataset.ppd, rs = sc.dataset.rs, side = h.dataset.side, x0 = ev.clientX, oS = bar.dataset.s, oE = bar.dataset.e;
      let s = oS, en = oE; dragged = false;
      h.setPointerCapture(ev.pointerId); document.body.classList.add('dragging-gantt'); bar.classList.add('active');
      const move = (m) => {
        const dd = Math.round((m.clientX - x0) / ppd);
        if (Math.abs(m.clientX - x0) > 2) dragged = true;
        s = oS; en = oE;
        if (side === 'l') s = U.addDays(oS, dd), s > oE && (s = oE); else en = U.addDays(oE, dd), en < oS && (en = oS);
        bar.style.left = U.diff(rs, s) * ppd + 'px'; bar.style.width = Math.max(14, (U.diff(s, en) + 1) * ppd) + 'px';
        tooltip(tipHTML(pid, bar.dataset.gid, s, en), m);
      };
      const up = () => {
        h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); h.removeEventListener('pointercancel', up);
        document.body.classList.remove('dragging-gantt'); bar.classList.remove('active'); hideTip();
        if (s !== oS || en !== oE) Model.setGoalDates(pid, bar.dataset.gid, s, en);
        setTimeout(() => { dragged = false; }, 50);
      };
      h.addEventListener('pointermove', move); h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
    });
  }

  window.Gantt = { build, bind, PPD };
})();
