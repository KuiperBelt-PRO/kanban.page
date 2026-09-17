/* Tooltips con estilo de la app (sustituyen el title nativo del navegador). */
const BoardTooltip = (() => {
  const SHOW_MS = 420;
  const GAP = 7;
  let root = null;
  let bubble = null;
  let timer = null;
  let host = null;

  function ensure() {
    if (root) return;
    root = document.createElement('div');
    root.className = 'tip-root';
    root.hidden = true;
    bubble = document.createElement('div');
    bubble.className = 'tip-bubble';
    root.appendChild(bubble);
    document.body.appendChild(root);
  }

  function readText(el) {
    const title = el.getAttribute('title');
    if (title) {
      el.dataset.tip = title;
      el.removeAttribute('title');
    }
    return (el.dataset.tip || '').trim();
  }

  function tipHost(el) {
    let node = el;
    while (node && node !== document.body) {
      if (node instanceof HTMLElement) {
        const text = node.getAttribute('title') || node.dataset.tip;
        if (text && text.trim()) return node;
      }
      node = node.parentElement;
    }
    return null;
  }

  function parseTip(text) {
    const raw = String(text || '').trim();
    const m = raw.match(/^(.+?)(?:\s|\u00a0)+([A-Za-z?][.]?)$/);
    if (m) return { label: m[1].trim(), key: m[2] };
    return { label: raw, key: null };
  }

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function render(text) {
    const { label, key } = parseTip(text);
    bubble.classList.toggle('is-wrap', label.length > 36);
    bubble.innerHTML = key
      ? `<span class="tip-label">${esc(label)}</span><kbd>${esc(key)}</kbd>`
      : `<span class="tip-label">${esc(label)}</span>`;
  }

  function place(el) {
    const rect = el.getBoundingClientRect();
    const box = bubble.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top = rect.top - box.height - GAP;
    let left = rect.left + (rect.width / 2) - (box.width / 2);
    if (top < 8) top = rect.bottom + GAP;
    left = Math.max(8, Math.min(left, vw - box.width - 8));
    top = Math.max(8, Math.min(top, vh - box.height - 8));
    root.style.left = `${Math.round(left)}px`;
    root.style.top = `${Math.round(top)}px`;
  }

  function hide() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    host = null;
    if (root) root.hidden = true;
  }

  function show(el) {
    ensure();
    const text = readText(el);
    if (!text) return hide();
    host = el;
    render(text);
    root.hidden = false;
    place(el);
    requestAnimationFrame(() => place(el));
  }

  function schedule(el) {
    if (host === el) return;
    hide();
    host = el;
    timer = setTimeout(() => {
      timer = null;
      if (host === el) show(el);
    }, SHOW_MS);
  }

  function onOver(e) {
    const next = tipHost(e.target);
    if (!next) {
      hide();
      return;
    }
    if (next === host && !root?.hidden) return;
    schedule(next);
  }

  function onOut(e) {
    const from = tipHost(e.target);
    const to = tipHost(e.relatedTarget);
    if (from && from !== to) hide();
  }

  function onFocusIn(e) {
    const next = tipHost(e.target);
    if (next) show(next);
  }

  function onFocusOut(e) {
    const from = tipHost(e.target);
    const to = tipHost(e.relatedTarget);
    if (from && from !== to) hide();
  }

  function onScroll() {
    if (host && root && !root.hidden) place(host);
  }

  function init() {
    ensure();
    document.addEventListener('mouseover', onOver, true);
    document.addEventListener('mouseout', onOut, true);
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('focusout', onFocusOut, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
  }

  return { init };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => BoardTooltip.init());
} else {
  BoardTooltip.init();
}

if (typeof module !== 'undefined') module.exports = { BoardTooltip };
