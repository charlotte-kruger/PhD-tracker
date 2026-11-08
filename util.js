/* Utilities: local-time date handling (all dates are 'YYYY-MM-DD' strings in the user's local zone) */
(function () {
  const pad = (n) => String(n).padStart(2, '0');
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const U = {
    pad, MON,
    iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); },
    today() { return U.iso(new Date()); },
    parse(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); },
    addDays(s, n) { const d = U.parse(s); d.setDate(d.getDate() + n); return U.iso(d); },
    /** whole days from a to b (b - a), DST-safe */
    diff(a, b) {
      const A = U.parse(a), B = U.parse(b);
      return Math.round((Date.UTC(B.getFullYear(), B.getMonth(), B.getDate()) - Date.UTC(A.getFullYear(), A.getMonth(), A.getDate())) / 864e5);
    },
    fmt(s) { if (!s) return ''; const d = U.parse(s); return MON[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear(); },
    fmtShort(s) { if (!s) return ''; const d = U.parse(s); return MON[d.getMonth()] + ' ' + d.getDate(); },
    uid() { return 'i' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4); },
    esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
    pct(x) { const r = Math.round(x * 10) / 10; return (Number.isInteger(r) ? r : r.toFixed(1)) + '%'; },
    clone(o) { return JSON.parse(JSON.stringify(o)); },
    stable(o) {
      const s = (v) => {
        if (Array.isArray(v)) return '[' + v.map(s).join(',') + ']';
        if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + s(v[k])).join(',') + '}';
        return JSON.stringify(v);
      };
      return s(o);
    },
    /** blend hex colour with white; t=0 -> original, t=1 -> white */
    lighten(hex, t) {
      const h = hex.replace('#', '');
      const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
      const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(c + (255 - c) * t));
      return '#' + ch.map((c) => pad(c.toString(16))).join('');
    },
    plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); },
    /** Task deadline indicator. Rules: >21 normal, 15-21 yellow, 8-14 orange, <=7 red, overdue red + label */
    deadline(task) {
      if (task.status === 'completed') {
        return { cls: 'dl-done', label: 'Completed' + (task.completedOn ? ' ' + U.fmtShort(task.completedOn) : ''), level: 'done' };
      }
      const d = U.diff(U.today(), task.end);
      if (d < 0) return { cls: 'dl-red dl-over', label: 'Overdue by ' + U.plural(-d, 'day'), level: 'overdue', days: d };
      if (d === 0) return { cls: 'dl-red', label: 'Due today', level: 'red', days: d };
      if (d <= 7) return { cls: 'dl-red', label: U.plural(d, 'day') + ' left', level: 'red', days: d };
      if (d <= 14) return { cls: 'dl-orange', label: U.plural(d, 'day') + ' left', level: 'orange', days: d };
      if (d <= 21) return { cls: 'dl-yellow', label: U.plural(d, 'day') + ' left', level: 'yellow', days: d };
      return { cls: 'dl-normal', label: U.plural(d, 'day') + ' left', level: 'normal', days: d };
    },
  };
  window.U = U;
})();
