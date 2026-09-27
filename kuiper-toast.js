'use strict';

/**
 * Apilado de notificaciones flotantes (info / warning / error).
 * API compatible: toast(msg), toast(msg, undoFn), toast(msg, undoFn, ms), toast(msg, undoFn, ms, type)
 * o toast(msg, { action, ms, type, persist }).
 */
const KuiperToast = (() => {
  const DEFAULT_MS = 5200;
  const MAX_STACK = 6;
  const TYPES = new Set(['info', 'warning', 'error']);

  let stackEl = null;
  let stackResizeObserver = null;

  function tr(key) {
    return typeof window.tr === 'function' ? window.tr(key) : key;
  }

  function syncChromeInsets() {
    const root = document.documentElement;
    const h = stackEl?.offsetHeight || 0;
    const inset = h > 0 ? `${h + 10}px` : '0px';
    root.style.setProperty('--toast-stack-inset', inset);
    if (h > 0) root.setAttribute('data-toast-stack', '');
    else root.removeAttribute('data-toast-stack');
  }

  function afterStackChange() {
    requestAnimationFrame(syncChromeInsets);
  }

  function ensureStack() {
    if (stackEl?.isConnected) return stackEl;
    stackEl = document.createElement('div');
    stackEl.className = 'toast-stack';
    stackEl.setAttribute('aria-live', 'polite');
    stackEl.setAttribute('aria-relevant', 'additions');
    document.body.appendChild(stackEl);
    if (!stackResizeObserver && typeof ResizeObserver !== 'undefined') {
      stackResizeObserver = new ResizeObserver(() => syncChromeInsets());
      stackResizeObserver.observe(stackEl);
    }
    return stackEl;
  }

  function normalizeArgs(msg, arg2, arg3, arg4) {
    let action = null;
    let ms = DEFAULT_MS;
    let type = 'info';
    let persist = false;
    if (arg2 && typeof arg2 === 'object' && typeof arg2 !== 'function') {
      ({
        action = null,
        ms = DEFAULT_MS,
        type = 'info',
        persist = false,
      } = arg2);
    } else {
      if (typeof arg2 === 'function' || arg2 === null || arg2 === undefined) action = arg2 ?? null;
      if (arg3 !== undefined) ms = arg3;
      if (arg4 !== undefined) type = arg4;
    }
    if (!TYPES.has(type)) type = 'info';
    if (persist) ms = 0;
    return { msg: String(msg ?? ''), action, ms, type, persist };
  }

  function trimStack(stack) {
    const cards = [...stack.querySelectorAll('.toast-card')];
    while (cards.length > MAX_STACK) {
      const oldest = cards.shift();
      if (oldest) dismissCard(oldest, true);
    }
  }

  function dismissCard(card, immediate = false) {
    if (!card || card.dataset.dismissed === '1') return;
    card.dataset.dismissed = '1';
    clearTimeout(Number(card.dataset.timerId) || 0);
    if (immediate) {
      card.remove();
      syncChromeInsets();
      afterStackChange();
      return;
    }
    card.classList.add('out');
    const done = () => {
      if (card.isConnected) card.remove();
      syncChromeInsets();
      afterStackChange();
    };
    card.addEventListener('animationend', done, { once: true });
    setTimeout(done, 220);
  }

  function iconFor(type) {
    if (type === 'error') {
      return '<svg class="toast-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 1.2a.8.8 0 0 1 .7.4l5.8 10A.8.8 0 0 1 13.8 13H2.2a.8.8 0 0 1-.7-1.4l5.8-10A.8.8 0 0 1 8 1.2Zm0 3.3a.55.55 0 0 0-.55.55v3.4c0 .3.25.55.55.55s.55-.25.55-.55V5.05A.55.55 0 0 0 8 4.5ZM8 11.2a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z"/></svg>';
    }
    if (type === 'warning') {
      return '<svg class="toast-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8.9 2.2 14.5 12a1 1 0 0 1-.9 1.5H2.4a1 1 0 0 1-.9-1.5L7.1 2.2a1 1 0 0 1 1.8 0ZM8 5.5a.6.6 0 0 0-.6.6v3.2c0 .33.27.6.6.6s.6-.27.6-.6V6.1a.6.6 0 0 0-.6-.6Zm0 6.75a.8.8 0 1 0 0-1.6.8.8 0 0 0 0 1.6Z"/></svg>';
    }
    return '<svg class="toast-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm-.35 3.2a.75.75 0 1 1 1.5 0v3.5a.75.75 0 1 1-1.5 0V4.7Zm.75 6.55a.9.9 0 1 1 0-1.8.9.9 0 0 1 0 1.8Z"/></svg>';
  }

  function toast(msg, arg2, arg3, arg4) {
    const { msg: text, action, ms, type } = normalizeArgs(msg, arg2, arg3, arg4);
    const stack = ensureStack();
    trimStack(stack);

    const card = document.createElement('div');
    card.className = `toast-card is-${type}`;
    card.setAttribute('role', type === 'error' ? 'alert' : 'status');

    const body = document.createElement('div');
    body.className = 'toast-card-body';
    body.innerHTML = `${iconFor(type)}<span class="toast-card-msg"></span>`;
    body.querySelector('.toast-card-msg').textContent = text;

    const actions = document.createElement('div');
    actions.className = 'toast-card-actions';

    if (action) {
      const undoBtn = document.createElement('button');
      undoBtn.type = 'button';
      undoBtn.className = 'toast-action';
      undoBtn.textContent = tr('undo');
      undoBtn.addEventListener('click', () => {
        action();
        dismissCard(card);
      });
      actions.appendChild(undoBtn);
    }

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'toast-close';
    closeBtn.setAttribute('aria-label', tr('toastClose'));
    closeBtn.innerHTML = '<span aria-hidden="true">×</span>';
    closeBtn.addEventListener('click', () => dismissCard(card));
    actions.appendChild(closeBtn);

    card.append(body, actions);
    stack.appendChild(card);
    syncChromeInsets();
    afterStackChange();

    if (ms > 0) {
      const timerId = window.setTimeout(() => dismissCard(card), ms);
      card.dataset.timerId = String(timerId);
    }

    return card;
  }

  function refreshLabels() {
    if (!stackEl) return;
    stackEl.querySelectorAll('.toast-action').forEach(btn => {
      btn.textContent = tr('undo');
    });
    stackEl.querySelectorAll('.toast-close').forEach(btn => {
      btn.setAttribute('aria-label', tr('toastClose'));
    });
  }

  return { toast, refreshLabels, dismissAll: () => stackEl?.querySelectorAll('.toast-card').forEach(c => dismissCard(c, true)) };
})();

if (typeof window !== 'undefined') window.KuiperToast = KuiperToast;
