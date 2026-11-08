/* Shared UI building blocks: modal, form builder, confirm dialog, toast, drag-to-reorder. */
(function () {
  const e = U.esc;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

  /* ---------- modal ---------- */
  const stack = [];
  function openModal({ title, html, wide, onClose }) {
    const root = $('#modalRoot');
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = '<div class="modal' + (wide ? ' wide' : '') + '" role="dialog" aria-modal="true" aria-label="' + e(title) + '"><div class="modal-head"><h2>' + e(title) + '</h2><button class="icon-btn" data-close aria-label="Close">✕</button></div><div class="modal-body">' + (html || '') + '</div></div>';
    root.appendChild(wrap);
    const api = {
      el: wrap, body: $('.modal-body', wrap),
      close() { if (!wrap.parentNode) return; wrap.remove(); stack.splice(stack.indexOf(api), 1); if (onClose) onClose(); },
    };
    wrap.addEventListener('mousedown', (ev) => { if (ev.target === wrap) api.close(); });
    wrap.addEventListener('click', (ev) => { if (ev.target.closest('[data-close]')) api.close(); });
    stack.push(api);
    const first = $('input:not([type=hidden]):not([type=color]), select', wrap); if (first) setTimeout(() => first.focus(), 30);
    return api;
  }
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && stack.length) stack[stack.length - 1].close(); });

  /* ---------- colour picker field ---------- */
  function swatches(name, value) {
    const pal = Model.PALETTE.slice();
    const custom = pal.indexOf(value) < 0;
    return '<div class="swatches" data-swatches="' + name + '">' +
      pal.map((c) => '<button type="button" class="sw' + (c === value ? ' sel' : '') + '" data-color="' + c + '" style="background:' + c + '" aria-label="' + c + '"></button>').join('') +
      '<label class="sw custom' + (custom ? ' sel' : '') + '" title="Custom colour"><input type="color" value="' + (value || '#6C5CE7') + '"><span>+</span></label>' +
      '<input type="hidden" name="' + name + '" value="' + e(value) + '"></div>';
  }
  function bindSwatches(scope, onPick) {
    scope.addEventListener('click', (ev) => {
      const b = ev.target.closest('button.sw'); if (!b) return;
      const box = b.closest('[data-swatches]'); pick(box, b.dataset.color, b);
    });
    scope.addEventListener('input', (ev) => {
      const i = ev.target.closest('.sw.custom input'); if (!i) return;
      pick(i.closest('[data-swatches]'), i.value, i.closest('.sw'));
    });
    function pick(box, color, el) {
      $$('.sw', box).forEach((s) => s.classList.remove('sel')); el.classList.add('sel');
      $('input[type=hidden]', box).value = color;
      if (onPick) onPick(box.dataset.swatches, color, box);
    }
  }

  /* ---------- form dialog ---------- */
  function field(f) {
    const id = 'f_' + f.name;
    let ctl = '';
    if (f.type === 'color') return '<div class="field"><label>' + e(f.label) + '</label>' + swatches(f.name, f.value) + '</div>';
    if (f.type === 'select') ctl = '<select id="' + id + '" name="' + f.name + '">' + f.options.map((o) => '<option value="' + e(o.value) + '"' + (o.value === f.value ? ' selected' : '') + '>' + e(o.label) + '</option>').join('') + '</select>';
    else ctl = '<input id="' + id + '" name="' + f.name + '" type="' + (f.type || 'text') + '" value="' + e(f.value || '') + '"' + (f.required !== false ? ' required' : '') + (f.maxlength ? ' maxlength="' + f.maxlength + '"' : '') + ' autocomplete="off">';
    return '<div class="field"><label for="' + id + '">' + e(f.label) + '</label>' + ctl + '</div>';
  }
  function openForm({ title, fields, submit = 'Save', onSubmit, extra = '' }) {
    const rows = []; let pair = [];
    fields.forEach((f) => {
      if (f.half) { pair.push(field(f)); if (pair.length === 2) { rows.push('<div class="row2">' + pair.join('') + '</div>'); pair = []; } }
      else { if (pair.length) { rows.push('<div class="row2">' + pair.join('') + '</div>'); pair = []; } rows.push(field(f)); }
    });
    if (pair.length) rows.push('<div class="row2">' + pair.join('') + '</div>');
    const m = openModal({ title, html: '<form novalidate>' + rows.join('') + extra + '<div class="form-error" role="alert"></div><div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button type="submit" class="btn primary">' + e(submit) + '</button></div></form>' });
    const form = $('form', m.el); bindSwatches(form);
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const v = {}; fields.forEach((f) => { v[f.name] = form.elements[f.name].value.trim(); });
      for (const f of fields) if (f.required !== false && f.type !== 'color' && !v[f.name]) { err(f.label + ' is required'); form.elements[f.name].focus(); return; }
      const msg = onSubmit(v); if (msg) { err(msg); return; } m.close();
    });
    function err(t) { $('.form-error', form).textContent = t; }
    return m;
  }

  /* ---------- confirm ---------- */
  function confirmDialog({ title, message, confirm = 'Delete', danger = true, extraHTML = '' }) {
    return new Promise((res) => {
      let answered = false;
      const m = openModal({ title, html: '<p class="confirm-msg">' + message + '</p>' + extraHTML + '<div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn ' + (danger ? 'danger' : 'primary') + '" data-ok>' + e(confirm) + '</button></div>', onClose: () => { if (!answered) res(null); } });
      $('[data-ok]', m.el).addEventListener('click', () => { answered = true; const body = m.body; res(body || true); m.close(); });
      const ok = $('[data-ok]', m.el); ok.focus();
    });
  }

  /* ---------- toast ---------- */
  function toast(msg, actionLabel, action) {
    const t = document.createElement('div'); t.className = 'toast';
    t.innerHTML = '<span>' + e(msg) + '</span>' + (actionLabel ? '<button>' + e(actionLabel) + '</button>' : '');
    if (actionLabel) $('button', t).addEventListener('click', () => { action(); t.remove(); });
    $('#toastRoot').appendChild(t); setTimeout(() => t.remove(), actionLabel ? 7000 : 3500);
  }

  /* ---------- drag-to-reorder (HTML5 DnD; only starts from the grip handle) ---------- */
  function sortable(container, itemSel, handleSel, onDrop) {
    if (!container) return;
    const items = $$(':scope > ' + itemSel, container);
    let dragEl = null, before = '';
    const ids = () => $$(':scope > ' + itemSel, container).map((i) => i.dataset.id).join(',');
    items.forEach((it) => {
      const h = handleSel ? $(handleSel, it) : it; if (!h) return;
      h.addEventListener('mousedown', () => { it.draggable = true; });
      h.addEventListener('mouseup', () => { it.draggable = false; });
      it.addEventListener('dragstart', (ev) => {
        if (!it.draggable) return; ev.stopPropagation();
        dragEl = it; before = ids(); ev.dataTransfer.effectAllowed = 'move'; try { ev.dataTransfer.setData('text/plain', it.dataset.id); } catch (x) { /* ignore */ }
        setTimeout(() => it.classList.add('dragging'), 0);
      });
      it.addEventListener('dragover', (ev) => {
        if (!dragEl || dragEl === it || dragEl.parentNode !== it.parentNode) return;
        ev.preventDefault(); ev.stopPropagation();
        const r = it.getBoundingClientRect(); const after = ev.clientY > r.top + r.height / 2;
        container.insertBefore(dragEl, after ? it.nextSibling : it);
      });
      it.addEventListener('dragend', () => {
        it.draggable = false; it.classList.remove('dragging');
        const now = ids(); dragEl = null;
        if (now !== before) onDrop(now.split(','));
      });
    });
  }

  window.UIC = { $, $$, openModal, openForm, confirmDialog, toast, sortable, swatches, bindSwatches };
})();
