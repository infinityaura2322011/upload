(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ToastManager = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VALID_TYPES = new Set(['success', 'error', 'warning', 'info', 'loading']);
  const DEFAULT_DURATIONS = {
    success: 4500,
    info: 4500,
    warning: 5500,
    error: 7000,
    loading: 0,
  };
  const MAX_VISIBLE_TOASTS = 4;

  let seq = 0;

  function normalizeToastOptions(input) {
    const opts = typeof input === 'string' ? { message: input } : (input || {});
    const type = VALID_TYPES.has(opts.type) ? opts.type : 'info';
    const title = String(opts.title || defaultTitleForType(type)).trim();
    const message = String(opts.message || '').trim();
    const durationMs = typeof opts.durationMs === 'number' && opts.durationMs >= 0
      ? opts.durationMs
      : DEFAULT_DURATIONS[type];
    const id = opts.id ? String(opts.id) : `toast-${++seq}-${Date.now().toString(36)}`;
    return { id, type, title, message, durationMs };
  }

  function defaultTitleForType(type) {
    switch (type) {
      case 'success': return 'Completed';
      case 'error': return 'Error';
      case 'warning': return 'Notice';
      case 'loading': return 'Working…';
      default: return 'Info';
    }
  }

  function applyToastQueueUpdate(queue, rawInput, maxVisible = MAX_VISIBLE_TOASTS) {
    const toast = normalizeToastOptions(rawInput);
    const next = Array.isArray(queue) ? [...queue] : [];
    const existingIdx = next.findIndex((item) => item.id === toast.id);
    if (existingIdx >= 0) {
      next[existingIdx] = toast;
      return { queue: next, toast, evictedIds: [], updatedExisting: true };
    }
    next.push(toast);
    const evictedIds = [];
    while (next.length > maxVisible) {
      const nonLoadingIdx = next.findIndex((item) => item.type !== 'loading');
      const removeIdx = nonLoadingIdx >= 0 ? nonLoadingIdx : 0;
      const [removed] = next.splice(removeIdx, 1);
      if (removed) evictedIds.push(removed.id);
    }
    return { queue: next, toast, evictedIds, updatedExisting: false };
  }

  // Browser DOM Controller
  const activeQueue = [];
  const timers = new Map();
  const hoverState = new Map();

  function ensureContainer() {
    if (typeof document === 'undefined') return null;
    let el = document.getElementById('toast-container');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast-container';
      el.className = 'toast-container';
      el.setAttribute('aria-live', 'polite');
      el.setAttribute('aria-atomic', 'false');
      document.body.appendChild(el);
    }
    return el;
  }

  function clearToastTimer(id) {
    const t = timers.get(id);
    if (t) {
      clearTimeout(t);
      timers.delete(id);
    }
  }

  function scheduleToastDismiss(toast) {
    clearToastTimer(toast.id);
    if (!toast.durationMs || toast.durationMs <= 0) return;
    if (hoverState.get(toast.id)) return;
    const handle = setTimeout(() => dismiss(toast.id), toast.durationMs);
    timers.set(toast.id, handle);
  }

  function iconMarkupForType(type) {
    switch (type) {
      case 'success': return '<span class="toast-icon" aria-hidden="true">✓</span>';
      case 'error': return '<span class="toast-icon" aria-hidden="true">✗</span>';
      case 'warning': return '<span class="toast-icon" aria-hidden="true">⚠</span>';
      case 'loading': return '<span class="toast-spinner" aria-hidden="true"></span>';
      default: return '<span class="toast-icon" aria-hidden="true">✦</span>';
    }
  }

  function renderToastNode(toast) {
    const container = ensureContainer();
    if (!container) return null;

    let card = container.querySelector(`[data-toast-id="${cssEscape(toast.id)}"]`);
    const isNew = !card;
    if (!card) {
      card = document.createElement('div');
      card.dataset.toastId = toast.id;
      card.addEventListener('mouseenter', () => {
        hoverState.set(toast.id, true);
        clearToastTimer(toast.id);
        card.classList.add('paused');
      });
      card.addEventListener('mouseleave', () => {
        hoverState.set(toast.id, false);
        card.classList.remove('paused');
        const current = activeQueue.find((t) => t.id === toast.id);
        if (current) scheduleToastDismiss(current);
      });
    }

    card.className = `toast-item toast-${toast.type}${isNew ? ' toast-enter' : ''}`;
    card.setAttribute('role', toast.type === 'error' ? 'alert' : 'status');

    card.innerHTML = '';

    const accent = document.createElement('div');
    accent.className = 'toast-accent';

    const iconWrap = document.createElement('div');
    iconWrap.className = 'toast-badge';
    iconWrap.innerHTML = iconMarkupForType(toast.type);

    const body = document.createElement('div');
    body.className = 'toast-body';

    const titleEl = document.createElement('div');
    titleEl.className = 'toast-title';
    titleEl.textContent = toast.title;
    body.appendChild(titleEl);

    if (toast.message) {
      const msgEl = document.createElement('div');
      msgEl.className = 'toast-message';
      msgEl.textContent = toast.message;
      body.appendChild(msgEl);
    }

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'toast-close';
    closeBtn.setAttribute('aria-label', `Dismiss ${toast.title}`);
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => dismiss(toast.id));

    card.appendChild(accent);
    card.appendChild(iconWrap);
    card.appendChild(body);
    card.appendChild(closeBtn);

    if (toast.durationMs > 0) {
      const progress = document.createElement('div');
      progress.className = 'toast-progress';
      progress.style.animationDuration = `${toast.durationMs}ms`;
      card.appendChild(progress);
    }

    if (isNew) {
      container.appendChild(card);
      requestAnimationFrame(() => card.classList.remove('toast-enter'));
    }
    return card;
  }

  function cssEscape(value) {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
      return CSS.escape(String(value));
    }
    return String(value).replace(/["\\]/g, '\\$&');
  }

  function removeDomToast(id) {
    if (typeof document === 'undefined') return;
    const container = document.getElementById('toast-container');
    if (!container) return;
    const card = container.querySelector(`[data-toast-id="${cssEscape(id)}"]`);
    if (!card) return;
    card.classList.add('toast-exit');
    setTimeout(() => {
      if (card.parentNode) card.parentNode.removeChild(card);
    }, 180);
  }

  function show(input) {
    const result = applyToastQueueUpdate(activeQueue, input, MAX_VISIBLE_TOASTS);
    activeQueue.length = 0;
    activeQueue.push(...result.queue);

    for (const evictedId of result.evictedIds) {
      clearToastTimer(evictedId);
      hoverState.delete(evictedId);
      removeDomToast(evictedId);
    }

    if (typeof document !== 'undefined') {
      renderToastNode(result.toast);
      scheduleToastDismiss(result.toast);
    }
    return result.toast.id;
  }

  function dismiss(id) {
    clearToastTimer(id);
    hoverState.delete(id);
    const idx = activeQueue.findIndex((t) => t.id === id);
    if (idx >= 0) activeQueue.splice(idx, 1);
    removeDomToast(id);
  }

  function clearAll() {
    for (const item of [...activeQueue]) {
      dismiss(item.id);
    }
  }

  return {
    VALID_TYPES,
    DEFAULT_DURATIONS,
    MAX_VISIBLE_TOASTS,
    normalizeToastOptions,
    applyToastQueueUpdate,
    show,
    success: (title, message, opts = {}) => show({ ...opts, type: 'success', title, message }),
    error: (title, message, opts = {}) => show({ ...opts, type: 'error', title, message }),
    warning: (title, message, opts = {}) => show({ ...opts, type: 'warning', title, message }),
    info: (title, message, opts = {}) => show({ ...opts, type: 'info', title, message }),
    loading: (title, message, opts = {}) => show({ ...opts, type: 'loading', title, message }),
    dismiss,
    clearAll,
    getActiveCount: () => activeQueue.length,
  };
});
