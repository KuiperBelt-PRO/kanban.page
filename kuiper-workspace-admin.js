/* Administración workspace Kuiper — tableros, proyectos, tags, sprints (vista en #board) */
const KuiperWorkspaceAdmin = (() => {
  let ctx = {};
  let host = null;
  let tab = 'organizations';
  let showArchivedEntities = false;
  let showArchivedProjects = false;
  let showArchivedTags = false;
  let showArchivedSprints = false;
  let pendingTab = null;
  /** Tablero cuyo detalle (proyectos, etapas) se muestra en la pestaña unificada */
  let selectedBoardSlug = null;
  let selectedBoardId = null;
  let selectedSprintId = null;
  let sprintDetailExpanded = true;
  let sprintComposeActive = false;
  let sprintListSort = 'startDesc';
  /** Org usada al listar tableros en Manage (evita depender solo de la URL) */
  let managedOrgSlug = '';

  function normalizeTab(next) {
    if (next === 'board') return 'boards';
    if (next === 'organization' || next === 'orgs') return 'organizations';
    if (next === 'tags') return 'projects';
    return next || 'organizations';
  }

  const WS_TAB_PREF = 'workspaceAdminTab';

  function readPersistedAdminTab() {
    const raw = ctx.loadKuiperPrefs?.()?.[WS_TAB_PREF];
    return raw ? normalizeTab(raw) : null;
  }

  function persistAdminTab(next) {
    const t = normalizeTab(next);
    if (!t || !ctx.saveKuiperPrefs) return;
    ctx.saveKuiperPrefs({ ...ctx.loadKuiperPrefs?.(), [WS_TAB_PREF]: t });
  }

  function syncManagedContext() {
    managedOrgSlug = orgSlug();
    if (!selectedBoardSlug) selectedBoardSlug = boardSlug();
    const st = ctx.state?.()._kuiper;
    if (!selectedBoardId && selectedBoardSlug === boardSlug() && st?.boardId) {
      selectedBoardId = st.boardId;
    }
  }

  const WS_ENTITY_COLORS = [
    '#FFB454', '#7FD1AE', '#8FB8FF', '#F58FA8', '#C79BFF', '#6FD3E8', '#D6C36B', '#9AA5B8',
  ];

  function wsColorByIndex(index) {
    return WS_ENTITY_COLORS[((Number(index) || 0) % WS_ENTITY_COLORS.length + WS_ENTITY_COLORS.length) % WS_ENTITY_COLORS.length];
  }

  function wsColorByName(name) {
    const s = String(name || '');
    let h = 0;
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i);
    return WS_ENTITY_COLORS[Math.abs(h) % WS_ENTITY_COLORS.length];
  }

  function wsEntityColor(stored, fallback) {
    return stored || fallback;
  }

  function normalizeTagInput(raw) {
    return String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
  }

  function wsEntityCodeHtml(code, fullTitle) {
    if (!code) return '';
    const title = fullTitle != null ? fullTitle : code;
    const titleAttr = title ? ` title="${esc(title)}"` : '';
    return `<span class="kuiper-ws-entity-code faint"${titleAttr}>${esc(code)}</span>`;
  }

  function catalogEntityRowHtml({
    kind,
    id,
    name,
    slug,
    code,
    color,
    colorKind,
    isArchived,
    archiveAct,
    restoreAct,
    deleteAct,
  }) {
    const archBadge = isArchived
      ? `<span class="kuiper-ws-archived-badge">${esc(tr('workspaceAdminArchivedBadge'))}</span>`
      : '';
    const actions = entityActionButtons({
      archived: isArchived,
      archiveAct,
      restoreAct,
      deleteAct,
      slugAttr: `${kind}-id`,
      slug: id,
    });
    const nameCls = kind === 'tag'
      ? 'kuiper-ws-input kuiper-ws-catalog-name kuiper-ws-tag-name'
      : 'kuiper-ws-input kuiper-ws-catalog-name';
    const idAttr = kind === 'project' ? 'data-project-id' : 'data-tag-id';
    if (kind === 'project') {
      return `<li class="kuiper-ws-board-row kuiper-ws-catalog-row kuiper-ws-project-catalog-row${isArchived ? ' is-archived-entity' : ''}" ${idAttr}="${esc(id)}" data-entity-name="${esc(name)}">
        <div class="kuiper-ws-project-catalog-ident">
          ${wsColorPickerHtml(color, { kind: colorKind, id })}
          <input type="text" class="${nameCls}" value="${esc(name)}" ${idAttr}="${esc(id)}" autocomplete="off" spellcheck="false">
        </div>
        <span class="faint kuiper-ws-entity-slug" title="${esc(slug || '')}">${esc(slug || '')}</span>
        ${wsEntityCodeHtml(code, slug)}
        <div class="kuiper-ws-board-row-actions">
          ${archBadge}
          ${actions}
        </div>
      </li>`;
    }
    const slugMeta = slug
      ? `<span class="faint kuiper-ws-catalog-meta"> · ${esc(slug)}</span>`
      : '';
    return `<li class="kuiper-ws-board-row kuiper-ws-catalog-row${isArchived ? ' is-archived-entity' : ''}" ${idAttr}="${esc(id)}" data-entity-name="${esc(name)}">
      <div class="kuiper-ws-board-select kuiper-ws-catalog-select">
        ${wsColorPickerHtml(color, { kind: colorKind, id })}
        <span class="kuiper-ws-catalog-name-wrap">
          <input type="text" class="${nameCls}" value="${esc(name)}" ${idAttr}="${esc(id)}" autocomplete="off" spellcheck="false">
          ${slugMeta}
        </span>
      </div>
      <div class="kuiper-ws-board-row-actions">
        ${archBadge}
        ${actions}
      </div>
    </li>`;
  }

  function entityIdFromRow(btn, kind) {
    const row = btn.closest('.kuiper-ws-catalog-row');
    if (kind === 'project') return row?.dataset.projectId || btn.dataset.projectId;
    return row?.dataset.tagId || btn.dataset.tagId;
  }

  function wireCatalogRowActionFocus(root) {
    root.querySelectorAll('.kuiper-ws-entity-actions button').forEach(btn => {
      btn.addEventListener('mousedown', e => { e.preventDefault(); });
    });
  }

  function bindTagNameInputs(root, { onRenamed } = {}) {
    root.querySelectorAll('.kuiper-ws-tag-name').forEach(inp => {
      const initial = inp.value;
      inp.addEventListener('input', () => {
        const v = normalizeTagInput(inp.value);
        if (inp.value !== v) inp.value = v;
      });
      inp.addEventListener('change', async () => {
        const newName = normalizeTagInput(inp.value);
        if (!newName) {
          inp.value = initial;
          ctx.toast?.(tr('workspaceAdminTagNameRequired'), null, 4000, 'warning');
          return;
        }
        if (newName === normalizeTagInput(initial)) return;
        try {
          await KuiperStore.patchTag(inp.dataset.tagId, { name: newName });
          inp.dataset.initialName = newName;
          await onRenamed?.();
        } catch (err) {
          inp.value = initial;
          ctx.toast?.(err.message, null, 8000, 'error');
        }
      });
    });
  }

  function bindNewTagInput(input) {
    if (!input) return;
    input.addEventListener('input', () => {
      const v = normalizeTagInput(input.value);
      if (input.value !== v) input.value = v;
    });
    input.placeholder = tr('workspaceAdminNewTagPlaceholder');
  }

  const WS_COLOR_NAMES = ['Amber', 'Mint', 'Sky', 'Rose', 'Violet', 'Cyan', 'Gold', 'Slate'];

  let wsColorDocClickBound = false;

  function wsNormalizeHex(raw) {
    const s = String(raw || '').trim();
    if (/^#[0-9A-Fa-f]{6}$/.test(s)) return s.toUpperCase();
    if (/^[0-9A-Fa-f]{6}$/.test(s)) return `#${s.toUpperCase()}`;
    return null;
  }

  function wsHexToRgb(hex) {
    const n = wsNormalizeHex(hex);
    if (!n) return null;
    const v = parseInt(n.slice(1), 16);
    return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
  }

  function wsRgbToHex(r, g, b) {
    const clamp = x => Math.min(255, Math.max(0, Math.round(x)));
    return `#${[clamp(r), clamp(g), clamp(b)].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
  }

  function wsRgbToHsv(r, g, b) {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
      if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
      else if (max === gn) h = ((bn - rn) / d + 2) / 6;
      else h = ((rn - gn) / d + 4) / 6;
    }
    const s = max === 0 ? 0 : d / max;
    return { h: h * 360, s, v: max };
  }

  function wsHsvToRgb(h, s, v) {
    let hn = ((Number(h) % 360) + 360) % 360 / 360;
    const i = Math.floor(hn * 6);
    const f = hn * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    let r; let g; let b;
    switch (i % 6) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      default: r = v; g = p; b = q;
    }
    return { r: r * 255, g: g * 255, b: b * 255 };
  }

  function wsReadSvThumb(field) {
    const thumb = field.querySelector('.kuiper-ws-color-sv-thumb');
    if (!thumb) return { s: 1, v: 1 };
    const s = Math.min(1, Math.max(0, parseFloat(thumb.dataset.s || '1')));
    const v = Math.min(1, Math.max(0, parseFloat(thumb.dataset.v || '1')));
    return { s, v };
  }

  function wsPlaceSvThumb(thumb, s, v) {
    if (!thumb) return;
    const ss = Math.min(1, Math.max(0, s));
    const vv = Math.min(1, Math.max(0, v));
    thumb.dataset.s = String(ss);
    thumb.dataset.v = String(vv);
    thumb.style.left = `${ss * 100}%`;
    thumb.style.top = `${(1 - vv) * 100}%`;
  }

  function wsUpdateSvPlane(field, hue) {
    const sv = field.querySelector('.kuiper-ws-color-sv');
    if (!sv) return;
    const h = Math.round(Number(hue) || 0);
    sv.style.setProperty('--ws-hue', String(h));
    sv.style.backgroundColor = `hsl(${h} 100% 50%)`;
  }

  function wsUpdateColorPickerFromHex(field, hex) {
    const rgb = wsHexToRgb(hex);
    if (!rgb) return;
    const hsv = wsRgbToHsv(rgb.r, rgb.g, rgb.b);
    const hueInp = field.querySelector('.kuiper-ws-color-hue');
    if (hueInp) hueInp.value = String(Math.round(hsv.h));
    wsUpdateSvPlane(field, hsv.h);
    wsPlaceSvThumb(field.querySelector('.kuiper-ws-color-sv-thumb'), hsv.s, hsv.v);
  }

  function wsHexFromPicker(field) {
    const hue = Number(field.querySelector('.kuiper-ws-color-hue')?.value || 0);
    const { s, v } = wsReadSvThumb(field);
    const rgb = wsHsvToRgb(hue, s, v);
    return wsRgbToHex(rgb.r, rgb.g, rgb.b);
  }

  const WS_PALETTE_CHECK = '<svg class="kuiper-ws-palette-check" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.3 5.1 8.8 9.6 3.4" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function closeAllWsColorPops(exceptField) {
    document.querySelectorAll('.kuiper-ws-color-field').forEach(field => {
      if (exceptField && field === exceptField) return;
      const pop = field.querySelector('.kuiper-ws-color-pop');
      const swatch = field.querySelector('.kuiper-ws-color-swatch');
      if (pop) pop.hidden = true;
      swatch?.setAttribute('aria-expanded', 'false');
    });
  }

  function syncWsColorFieldUi(field, hex) {
    const c = hex || field.dataset.current || '#9AA5B8';
    field.dataset.current = c;
    const swatch = field.querySelector('.kuiper-ws-color-swatch');
    const wrap = field.querySelector('.kuiper-ws-color-swatch-wrap');
    if (swatch) swatch.style.setProperty('--c', c);
    if (wrap) wrap.style.setProperty('--c', c);
    field.querySelectorAll('.kuiper-ws-palette-btn').forEach(btn => {
      const pick = btn.dataset.pickColor || '';
      btn.setAttribute('aria-pressed', pick.toUpperCase() === c.toUpperCase() ? 'true' : 'false');
    });
    const hexInp = field.querySelector('.kuiper-ws-color-hex');
    if (hexInp) hexInp.value = c;
    const previewHex = field.querySelector('.kuiper-ws-color-preview-hex');
    if (previewHex) previewHex.textContent = c;
    const previewSw = field.querySelector('.kuiper-ws-color-preview-swatch');
    if (previewSw) previewSw.style.setProperty('--c', c);
    const hueInp = field.querySelector('.kuiper-ws-color-hue');
    if (hueInp) hueInp.style.setProperty('--c', c);
    wsUpdateColorPickerFromHex(field, c);
  }

  function wsColorPickerHtml(hex, { kind, id }) {
    const c = (hex || '#9AA5B8').toUpperCase();
    const palette = WS_ENTITY_COLORS.map((col, i) => {
      const pressed = col.toUpperCase() === c;
      return `<button type="button" class="kuiper-ws-palette-btn" style="--c:${esc(col)}" data-pick-color="${esc(col)}" aria-pressed="${pressed ? 'true' : 'false'}" title="${esc(WS_COLOR_NAMES[i])}">${WS_PALETTE_CHECK}</button>`;
    }).join('');
    return `<div class="kuiper-ws-color-field" data-color-kind="${esc(kind)}" data-entity-id="${esc(id)}" data-current="${esc(c)}">
      <span class="kuiper-ws-color-swatch-wrap" style="--c:${esc(c)}">
        <button type="button" class="kuiper-ws-color-swatch" style="--c:${esc(c)}" aria-expanded="false" aria-haspopup="dialog" title="${esc(tr('workspaceAdminPickColor'))}"></button>
      </span>
      <div class="kuiper-ws-color-pop" hidden role="dialog" aria-label="${esc(tr('workspaceAdminPickColor'))}">
        <div class="kuiper-ws-color-pop-head">
          <span class="kuiper-ws-color-preview-swatch" style="--c:${esc(c)}" aria-hidden="true"></span>
          <span class="kuiper-ws-color-preview-hex">${esc(c)}</span>
        </div>
        <div class="kuiper-ws-palette" role="listbox">${palette}</div>
        <div class="kuiper-ws-color-picker-custom">
          <div class="kuiper-ws-color-sv" role="application" aria-label="${esc(tr('workspaceAdminColorCustom'))}">
            <span class="kuiper-ws-color-sv-thumb"></span>
          </div>
          <input type="range" class="kuiper-ws-color-hue" min="0" max="360" value="35" aria-label="${esc(tr('workspaceAdminColorHue'))}">
        </div>
        <div class="kuiper-ws-color-custom">
          <input type="text" class="kuiper-ws-input kuiper-ws-color-hex" value="${esc(c)}" maxlength="7" spellcheck="false" autocomplete="off" aria-label="${esc(tr('workspaceAdminColorHex'))}">
          <button type="button" class="pill sm" data-act="apply-custom-color">${esc(tr('save'))}</button>
        </div>
      </div>
    </div>`;
  }

  function ensureWsColorDocClose() {
    if (wsColorDocClickBound) return;
    wsColorDocClickBound = true;
    document.addEventListener('click', e => {
      if (e.target.closest('.kuiper-ws-color-field')) return;
      closeAllWsColorPops();
    });
  }

  let wsColorHandlers = null;
  let wsColorRootClick = null;

  function wireWsColorPickers(root, { onProjectColor, onTagColor }) {
    wsColorHandlers = { onProjectColor, onTagColor };
    ensureWsColorDocClose();
    if (wsColorRootClick) root.removeEventListener('click', wsColorRootClick);
    wsColorRootClick = async e => {
      const apply = async (field, hex) => {
        const next = wsNormalizeHex(hex);
        if (!next) {
          ctx.toast?.(tr('workspaceAdminColorInvalid'), null, 4000, 'warning');
          return;
        }
        syncWsColorFieldUi(field, next);
        const id = field.dataset.entityId;
        try {
          if (field.dataset.colorKind === 'project') await wsColorHandlers?.onProjectColor?.(id, next);
          else if (field.dataset.colorKind === 'tag') await wsColorHandlers?.onTagColor?.(id, next);
        } catch (err) {
          ctx.toast?.(err.message, null, 8000, 'error');
        }
      };

      const swatch = e.target.closest('.kuiper-ws-color-swatch');
      if (swatch) {
        e.stopPropagation();
        const field = swatch.closest('.kuiper-ws-color-field');
        const pop = field?.querySelector('.kuiper-ws-color-pop');
        const open = pop && !pop.hidden;
        closeAllWsColorPops();
        if (pop && field && !open) {
          pop.hidden = false;
          swatch.setAttribute('aria-expanded', 'true');
          wsUpdateColorPickerFromHex(field, field.dataset.current);
          pop.querySelector('.kuiper-ws-color-hex')?.focus();
        }
        return;
      }

      const palBtn = e.target.closest('.kuiper-ws-palette-btn');
      if (palBtn) {
        e.stopPropagation();
        const field = palBtn.closest('.kuiper-ws-color-field');
        if (field) {
          await apply(field, palBtn.dataset.pickColor);
          closeAllWsColorPops();
        }
        return;
      }

      const applyBtn = e.target.closest('[data-act="apply-custom-color"]');
      if (applyBtn) {
        e.stopPropagation();
        const field = applyBtn.closest('.kuiper-ws-color-field');
        const hexInp = field?.querySelector('.kuiper-ws-color-hex');
        if (field) {
          await apply(field, hexInp?.value);
          closeAllWsColorPops();
        }
      }
    };
    root.addEventListener('click', wsColorRootClick);

    const previewHexOnly = (field, raw) => {
      const next = wsNormalizeHex(raw);
      if (next) syncWsColorFieldUi(field, next);
    };

    root.querySelectorAll('.kuiper-ws-color-hue').forEach(inp => {
      inp.addEventListener('input', () => {
        const field = inp.closest('.kuiper-ws-color-field');
        if (!field) return;
        wsUpdateSvPlane(field, inp.value);
        const hex = wsHexFromPicker(field);
        syncWsColorFieldUi(field, hex);
      });
    });

    root.querySelectorAll('.kuiper-ws-color-sv').forEach(sv => {
      const pickAt = (clientX, clientY) => {
        const field = sv.closest('.kuiper-ws-color-field');
        if (!field) return;
        const rect = sv.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const s = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
        const v = Math.min(1, Math.max(0, 1 - (clientY - rect.top) / rect.height));
        wsPlaceSvThumb(sv.querySelector('.kuiper-ws-color-sv-thumb'), s, v);
        syncWsColorFieldUi(field, wsHexFromPicker(field));
      };
      sv.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        e.preventDefault();
        sv.setPointerCapture(e.pointerId);
        pickAt(e.clientX, e.clientY);
      });
      sv.addEventListener('pointermove', e => {
        if (!sv.hasPointerCapture(e.pointerId)) return;
        pickAt(e.clientX, e.clientY);
      });
      sv.addEventListener('pointerup', e => {
        if (sv.hasPointerCapture(e.pointerId)) sv.releasePointerCapture(e.pointerId);
      });
    });

    root.querySelectorAll('.kuiper-ws-color-hex').forEach(inp => {
      inp.addEventListener('input', () => {
        const field = inp.closest('.kuiper-ws-color-field');
        if (field) previewHexOnly(field, inp.value);
      });
      inp.onkeydown = async ev => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          const field = inp.closest('.kuiper-ws-color-field');
          if (!field) return;
          const next = wsNormalizeHex(inp.value);
          if (!next) {
            ctx.toast?.(tr('workspaceAdminColorInvalid'), null, 4000, 'warning');
            return;
          }
          syncWsColorFieldUi(field, next);
          const id = field.dataset.entityId;
          try {
            if (field.dataset.colorKind === 'project') await wsColorHandlers?.onProjectColor?.(id, next);
            else if (field.dataset.colorKind === 'tag') await wsColorHandlers?.onTagColor?.(id, next);
          } catch (err) {
            ctx.toast?.(err.message, null, 8000, 'error');
          }
          closeAllWsColorPops();
        }
        if (ev.key === 'Escape') {
          ev.preventDefault();
          closeAllWsColorPops();
        }
      };
    });
  }

  function bindSubmitOnEnter(input, submit) {
    if (!input || typeof submit !== 'function') return;
    input.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      submit();
    });
  }

  function tr(k, v) {
    return ctx.tr?.(k, v) ?? k;
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  const WS_ICON = {
    archive: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h10v7.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6z"/><path d="M6 6V4.5A1 1 0 0 1 7 3.5h2a1 1 0 0 1 1 1V6"/><path d="M3 6h10"/></svg>',
    restore: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3v4.5"/><path d="M5.5 5 8 2.5 10.5 5"/><path d="M4 8.5v3a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-3"/></svg>',
    delete: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 5h9"/><path d="M6 5V3.75A.75.75 0 0 1 6.75 3h2.5a.75.75 0 0 1 .75.75V5"/><path d="M5.25 5l.4 7.2a.75.75 0 0 0 .75.7h3.2a.75.75 0 0 0 .75-.7L10.75 5"/></svg>',
  };

  function archivedFlag(row) {
    return !!(row && (row.archived === true || row.archived === 1));
  }

  async function refreshNavSidebar() {
    if (typeof KuiperUI !== 'undefined') {
      await KuiperUI.loadNavigation?.();
      KuiperUI.renderSidebar?.();
      KuiperUI.refreshFilters?.();
    }
  }

  function archivedToggleHtml(checkboxId, checked) {
    return `<label class="kuiper-ws-check kuiper-ws-archived-toggle">
      <input type="checkbox" id="${esc(checkboxId)}" ${checked ? 'checked' : ''}>
      <span>${esc(tr('workspaceAdminShowArchived'))}</span>
    </label>`;
  }

  function wireArchivedToggle(body, checkboxId, onChange) {
    const cb = body.querySelector(`#${checkboxId}`);
    if (!cb) return;
    cb.onchange = () => {
      onChange(cb.checked);
      void renderBody();
    };
  }

  async function confirmArchiveEntity(name) {
    const C = typeof KuiperConfirm !== 'undefined' ? KuiperConfirm : null;
    if (C) {
      return C.confirmArchive({
        title: tr('workspaceAdminArchiveTitle', { name }),
        message: tr('workspaceAdminArchiveMsg', { name }),
        confirmLabel: tr('archiveVerb'),
        cancelLabel: tr('cancel'),
      });
    }
    return window.confirm(`${tr('workspaceAdminArchiveTitle', { name })}\n\n${tr('workspaceAdminArchiveMsg', { name })}`);
  }

  async function confirmDeleteEntity(name, { message } = {}) {
    const C = typeof KuiperConfirm !== 'undefined' ? KuiperConfirm : null;
    const word = tr('deleteConfirmWord');
    const msg = message || tr('workspaceAdminDeleteMsg', { name });
    if (C) {
      return C.confirmDelete({
        title: tr('workspaceAdminDeleteTitle', { name }),
        message: msg,
        typeWord: word,
        placeholder: tr('deleteConfirmInputPlaceholder', { word }),
        confirmLabel: tr('delete'),
        cancelLabel: tr('cancel'),
      });
    }
    const typed = window.prompt(
      `${tr('workspaceAdminDeleteTitle', { name })}\n${tr('deleteConfirmHint', { word })}`,
      '',
    );
    return typed?.trim().toLowerCase() === word.toLowerCase();
  }

  function formatProjectDeletionMessage(impact) {
    const parts = [tr('workspaceAdminDeleteProjectIntro', { name: impact.project_name })];
    if (impact.cards > 0) parts.push(tr('workspaceAdminDeleteProjectCards', { count: impact.cards }));
    if (impact.subtasks > 0) parts.push(tr('workspaceAdminDeleteProjectSubtasks', { count: impact.subtasks }));
    if (impact.epics > 0) parts.push(tr('workspaceAdminDeleteProjectEpics', { count: impact.epics }));
    if (impact.board_links > 0) parts.push(tr('workspaceAdminDeleteProjectBoardLinks', { count: impact.board_links }));
    if (impact.sprint_links > 0) parts.push(tr('workspaceAdminDeleteProjectSprintLinks', { count: impact.sprint_links }));
    if (impact.github_repos > 0) parts.push(tr('workspaceAdminDeleteProjectRepos', { count: impact.github_repos }));
    parts.push(tr('workspaceAdminDeleteProjectWarn'));
    return parts.join('\n');
  }

  function formatTagDeletionMessage(impact) {
    const parts = [tr('workspaceAdminDeleteTagIntro', { name: impact.tag_name })];
    if (impact.cards > 0) parts.push(tr('workspaceAdminDeleteTagCards', { count: impact.cards }));
    parts.push(tr('workspaceAdminDeleteProjectWarn'));
    return parts.join('\n');
  }

  function entityActionButtons({ archived, archiveAct, restoreAct, deleteAct, slugAttr, slug }) {
    const attr = slugAttr ? ` data-${slugAttr}="${esc(slug)}"` : '';
    const archiveLabel = archived ? tr('restore') : tr('archiveVerb');
    const archiveIcon = archived ? WS_ICON.restore : WS_ICON.archive;
    const act = archived ? restoreAct : archiveAct;
    const deleteLabel = tr('delete');
    return `<div class="kuiper-ws-entity-actions">
      <button type="button" class="icon sm kuiper-ws-entity-icon" data-act="${act}"${attr} title="${esc(archiveLabel)}" aria-label="${esc(archiveLabel)}">${archiveIcon}</button>
      <button type="button" class="icon sm kuiper-ws-entity-icon danger" data-act="${deleteAct}"${attr} title="${esc(deleteLabel)}" aria-label="${esc(deleteLabel)}">${WS_ICON.delete}</button>
    </div>`;
  }

  async function afterBoardRemoved(slug) {
    if (slug === boardSlug()) {
      const org = orgSlug();
      const boards = await KuiperStore.listOrgBoards(org).catch(() => []);
      const next = boards[0]?.slug;
      if (next) await activateBoardInPlace(next);
      else ctx.resetOrgContext?.({ slug: org });
    }
    if (selectedBoardSlug === slug) {
      selectedBoardSlug = null;
      selectedBoardId = null;
    }
    await refreshNavSidebar();
    await reloadBoard();
  }

  function orgSlug() {
    const fromUrl = new URLSearchParams(location.search).get('org');
    if (fromUrl) return fromUrl;
    return ctx.state?.()._kuiper?.organization?.slug || '';
  }

  function boardStoreOpts() {
    const org = managedOrgSlug || orgSlug();
    const stOrg = ctx.state?.()._kuiper?.organization;
    const opts = {};
    if (org) opts.org = org;
    else if (stOrg?.slug) opts.org = stOrg.slug;
    if (stOrg?.id) opts.organizationId = stOrg.id;
    return opts;
  }

  /** Identificador de tablero para la API (id evita slugs duplicados entre orgs). */
  function boardApiKey(slug = selectedBoardSlug) {
    if (slug === selectedBoardSlug && selectedBoardId) return selectedBoardId;
    const st = ctx.state?.()._kuiper;
    if (slug === boardSlug() && st?.boardId) return st.boardId;
    return slug;
  }

  function syncOrgInUrl() {
    const org = managedOrgSlug || orgSlug();
    if (!org) return;
    const u = new URL(location.href);
    if (u.searchParams.get('org') === org) return;
    u.searchParams.set('org', org);
    history.replaceState(null, '', `${u.pathname}${u.search}${u.hash}`);
  }

  function boardSlug() {
    const fromUrl = KuiperStore.boardSlug();
    if (fromUrl) return fromUrl;
    return ctx.state?.()._kuiper?.boardSlug || '';
  }

  function pageRoot() {
    return host?.querySelector('.kuiper-ws-page') || null;
  }

  function bodyEl() {
    return pageRoot()?.querySelector('.kuiper-ws-body') || null;
  }

  async function afterBoardDetailMutation(slug) {
    if (slug === boardSlug()) {
      await ctx.loadKuiperBoard?.();
      ctx.render?.();
    }
    await refreshNavSidebar();
    if (tab === 'boards') {
      syncBoardListSelection();
      await refreshBoardsPanels();
      return;
    }
    await reloadBoard();
  }

  async function reloadBoard() {
    await ctx.loadKuiperBoard?.();
    if (typeof KuiperUI !== 'undefined' && KuiperUI.isWorkspaceView?.()) {
      if (tab === 'boards') {
        await refreshNavSidebar();
        syncBoardListSelection();
        await refreshBoardsPanels();
        return;
      }
      ctx.renderBoard?.();
      await refreshNavSidebar();
      await renderBody();
      return;
    }
    ctx.render?.();
    await refreshNavSidebar();
  }

  function ensureShell() {
    if (!host) return;
    if (pageRoot()) return;
    host.innerHTML = `
      <div class="kuiper-ws-page">
        <header class="kuiper-ws-head">
          <h2 id="kuiperWsAdminTitle"></h2>
          <nav class="seg kuiper-ws-tabs" role="tablist" aria-label="${esc(tr('workspaceManage'))}"></nav>
        </header>
        <div class="panel-body kuiper-ws-body kuiper-scroll"></div>
      </div>`;
  }

  function setTab(next) {
    tab = normalizeTab(next);
    persistAdminTab(tab);
    renderBody();
  }

  function prepare(nextTab) {
    const next = nextTab != null && nextTab !== ''
      ? normalizeTab(nextTab)
      : (readPersistedAdminTab() || normalizeTab(tab));
    pendingTab = next;
    tab = next;
    persistAdminTab(next);
    syncManagedContext();
  }

  function syncAfterBoardLoad() {
    syncManagedContext();
  }

  function tabButtons() {
    const nav = pageRoot()?.querySelector('.kuiper-ws-tabs');
    if (!nav) return;
    const tabs = [
      ['organizations', 'workspaceAdminTabOrganizations'],
      ['projects', 'projects'],
      ['boards', 'workspaceAdminTabBoards'],
      ['sprints', 'sprints'],
    ];
    nav.innerHTML = tabs.map(([id, key]) =>
      `<button type="button" role="tab" data-tab="${id}" aria-pressed="${tab === id}">${esc(tr(key))}</button>`,
    ).join('');
    nav.querySelectorAll('[data-tab]').forEach(btn => {
      btn.onclick = () => setTab(btn.dataset.tab);
    });
  }

  function openBoardInApp(slug) {
    const org = orgSlug();
    if (typeof KuiperUI !== 'undefined' && KuiperUI.exitWorkspace) {
      KuiperUI.exitWorkspace();
    }
    if (typeof KuiperUI !== 'undefined' && KuiperUI.navigateToBoard) {
      KuiperUI.navigateToBoard(slug, org);
      return;
    }
    const u = new URL(location.href);
    u.searchParams.set('board', slug);
    if (org) u.searchParams.set('org', org);
    location.href = u.toString();
  }

  async function activateBoardInPlace(slug) {
    const org = orgSlug();
    if (typeof KuiperUI !== 'undefined' && KuiperUI.switchBoardInPlace) {
      await KuiperUI.switchBoardInPlace(slug, org);
      return;
    }
    openBoardInApp(slug);
  }

  function boardsBodyScrollEl() {
    return bodyEl();
  }

  function withPreservedScroll(fn) {
    const scroller = boardsBodyScrollEl();
    const top = scroller?.scrollTop ?? 0;
    return Promise.resolve(fn()).then(() => {
      if (scroller) scroller.scrollTop = top;
    });
  }

  function boardRowHtml(b, current, selected) {
    const isCurrent = b.slug === current;
    const isSelected = b.slug === selected;
    const muted = !isCurrent && !isSelected;
    const classes = [
      'kuiper-ws-board-row',
      muted ? 'kuiper-ws-board-row--muted' : '',
      isCurrent ? 'kuiper-ws-board-row--current' : '',
      isSelected ? 'is-selected' : '',
    ].filter(Boolean).join(' ');
    const isArchived = archivedFlag(b);
    const currentBadge = isCurrent
      ? `<span class="kuiper-ws-board-current">${esc(tr('workspaceAdminCurrentBoard'))}</span>`
      : `<span class="kuiper-ws-board-current kuiper-ws-board-current--empty" aria-hidden="true"></span>`;
    const archBadge = isArchived
      ? `<span class="kuiper-ws-archived-badge">${esc(tr('workspaceAdminArchivedBadge'))}</span>`
      : '';
    const actions = entityActionButtons({
      archived: isArchived,
      archiveAct: 'archive-board',
      restoreAct: 'restore-board',
      deleteAct: 'delete-board',
      slugAttr: 'board-slug',
      slug: b.slug,
    });
    return `<li class="${classes} kuiper-ws-catalog-row kuiper-ws-board-catalog-row${isArchived ? ' is-archived-entity' : ''}" data-board-id="${esc(b.id)}" data-board-slug="${esc(b.slug)}" data-board-name="${esc(b.name)}" data-entity-name="${esc(b.name)}">
      <div class="kuiper-ws-board-catalog-ident kuiper-ws-board-select-main" data-board-slug="${esc(b.slug)}" data-board-id="${esc(b.id)}">
        <input type="text" class="kuiper-ws-input kuiper-ws-catalog-name kuiper-ws-board-name" data-board-id="${esc(b.id)}" value="${esc(b.name)}" autocomplete="off" spellcheck="false">
      </div>
      <span class="faint kuiper-ws-entity-slug kuiper-ws-board-slug-col" title="${esc(b.slug)}">${esc(b.slug)}</span>
      <span class="kuiper-ws-board-code-col">${wsEntityCodeHtml(b.code, b.slug)}</span>
      <div class="kuiper-ws-board-row-meta">${archBadge}${currentBadge}</div>
      <div class="kuiper-ws-board-row-actions">
        <button type="button" class="pill sm" data-act="open-board" data-board-slug="${esc(b.slug)}">${esc(tr('workspaceAdminOpenBoard'))}</button>
        ${actions}
      </div>
    </li>`;
  }

  function syncBoardListSelection() {
    const current = boardSlug();
    const ul = boardsBodyScrollEl()?.querySelector('#kuiperWsBoardList');
    if (!ul) return;
    ul.querySelectorAll('.kuiper-ws-board-row').forEach(row => {
      const slug = row.dataset.boardSlug;
      const isCurrent = slug === current;
      const isSelected = slug === selectedBoardSlug;
      const muted = !isCurrent && !isSelected;
      row.classList.toggle('kuiper-ws-board-row--muted', muted);
      row.classList.toggle('kuiper-ws-board-row--current', isCurrent);
      row.classList.toggle('is-selected', isSelected);
      const nameInp = row.querySelector('.kuiper-ws-board-name');
      if (nameInp && document.activeElement !== nameInp) {
        const name = row.dataset.boardName || slug;
        if (nameInp.value !== name) nameInp.value = name;
      }
      const meta = row.querySelector('.kuiper-ws-board-row-meta');
      let badge = meta?.querySelector('.kuiper-ws-board-current:not(.kuiper-ws-board-current--empty)');
      if (isCurrent) {
        if (!badge && meta) {
          const empty = meta.querySelector('.kuiper-ws-board-current--empty');
          if (empty) {
            empty.classList.remove('kuiper-ws-board-current--empty');
            empty.removeAttribute('aria-hidden');
            empty.textContent = tr('workspaceAdminCurrentBoard');
          } else {
            meta.insertAdjacentHTML('beforeend',
              `<span class="kuiper-ws-board-current">${esc(tr('workspaceAdminCurrentBoard'))}</span>`);
          }
        }
      } else {
        const cur = meta?.querySelector('.kuiper-ws-board-current');
        if (cur) {
          cur.classList.add('kuiper-ws-board-current--empty');
          cur.setAttribute('aria-hidden', 'true');
          cur.textContent = '';
        }
      }
    });
  }

  function boardNameFromRow(row) {
    return row?.querySelector('.kuiper-ws-board-name')?.value.trim()
      || row?.dataset.boardName
      || row?.dataset.boardSlug
      || '';
  }

  function bindBoardNameInputs(root) {
    root.querySelectorAll('input.kuiper-ws-board-name').forEach(inp => {
      inp.addEventListener('change', async () => {
        const row = inp.closest('.kuiper-ws-board-row');
        const slug = row?.dataset.boardSlug;
        const prev = row?.dataset.boardName || '';
        const name = inp.value.trim();
        if (!name) {
          inp.value = prev;
          return;
        }
        if (name === prev) return;
        const apiKey = inp.dataset.boardId || row?.dataset.boardId || boardApiKey(slug);
        try {
          await KuiperStore.patchBoard(apiKey, { name }, boardStoreOpts());
          row.dataset.boardName = name;
          row.dataset.entityName = name;
          await afterBoardDetailMutation(slug);
        } catch (err) {
          inp.value = prev;
          ctx.toast?.(err.message, null, 8000, 'error');
        }
      });
    });
  }

  function wireBoardListHandlers(root) {
    wireCatalogRowActionFocus(root);
    bindBoardNameInputs(root);
    root.querySelectorAll('.kuiper-ws-board-select-main').forEach(zone => {
      zone.addEventListener('click', e => {
        if (e.target.closest('input.kuiper-ws-board-name')) return;
        selectedBoardSlug = zone.dataset.boardSlug;
        selectedBoardId = zone.dataset.boardId || zone.closest('.kuiper-ws-board-row')?.dataset.boardId || null;
        withPreservedScroll(async () => {
          syncBoardListSelection();
          const row = zone.closest('.kuiper-ws-board-row');
          const metaName = boardNameFromRow(row);
          const host = root.querySelector('#kuiperWsBoardDetail');
          if (host) await fillBoardDetail(host, selectedBoardSlug, metaName);
        });
      });
    });
    root.querySelectorAll('[data-act="open-board"]').forEach(btn => {
      btn.onclick = () => {
        selectedBoardSlug = btn.dataset.boardSlug;
        openBoardInApp(btn.dataset.boardSlug);
      };
    });
    root.querySelectorAll('[data-act="archive-board"]').forEach(btn => {
      btn.onclick = async () => {
        const slug = btn.dataset.boardSlug;
        const row = btn.closest('.kuiper-ws-board-row');
        const apiKey = row?.dataset.boardId || boardApiKey(slug);
        const name = boardNameFromRow(row) || slug;
        if (!await confirmArchiveEntity(name)) return;
        try {
          await KuiperStore.patchBoard(apiKey, { archived: true }, boardStoreOpts());
          ctx.toast?.(tr('workspaceAdminArchivedToast'));
          await afterBoardRemoved(slug);
          await renderBody();
        } catch (err) {
          ctx.toast?.(err.message, null, 8000, 'error');
        }
      };
    });
    root.querySelectorAll('[data-act="restore-board"]').forEach(btn => {
      btn.onclick = async () => {
        const slug = btn.dataset.boardSlug;
        const row = btn.closest('.kuiper-ws-board-row');
        const apiKey = row?.dataset.boardId || boardApiKey(slug);
        try {
          await KuiperStore.patchBoard(apiKey, { archived: false }, boardStoreOpts());
          await refreshNavSidebar();
          ctx.toast?.(tr('restore'));
          await renderBody();
        } catch (err) {
          ctx.toast?.(err.message, null, 8000, 'error');
        }
      };
    });
    root.querySelectorAll('[data-act="delete-board"]').forEach(btn => {
      btn.onclick = async () => {
        const slug = btn.dataset.boardSlug;
        const row = btn.closest('.kuiper-ws-board-row');
        const apiKey = row?.dataset.boardId || boardApiKey(slug);
        const name = boardNameFromRow(row) || slug;
        if (!await confirmDeleteEntity(name)) return;
        try {
          await KuiperStore.deleteBoard(apiKey, boardStoreOpts());
          ctx.toast?.(tr('workspaceAdminDeletedToast'));
          await afterBoardRemoved(slug);
          await renderBody();
        } catch (err) {
          ctx.toast?.(err.message, null, 8000, 'error');
        }
      };
    });
  }

  async function submitNewBoard(root) {
    const org = orgSlug();
    const name = root.querySelector('#kuiperWsNewBoardName')?.value.trim();
    if (!name) {
      ctx.toast?.(tr('workspaceAdminBoardNameRequired'), null, undefined, 'warning');
      return;
    }
    try {
      const created = await KuiperStore.createOrgBoard(org, { name });
      const slug = created?.board?.slug || created?.slug;
      if (!slug) {
        await reloadBoard();
        await renderBody();
        return;
      }
      selectedBoardSlug = slug;
      selectedBoardId = created?.board?.id || created?.id || null;
      const nameInput = root.querySelector('#kuiperWsNewBoardName');
      if (nameInput) nameInput.value = '';
      await activateBoardInPlace(slug);
      await renderBody();
    } catch (err) {
      ctx.toast?.(err.message, null, 8000, 'error');
    }
  }

  function wireStageDrag(slug, stagesEl) {
    let dragRow = null;
    let startOrder = null;

    const clearTargets = () => {
      stagesEl.querySelectorAll('.kuiper-ws-stage-row').forEach(r => r.classList.remove('is-drop-target'));
    };

    const finishDrag = async () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerUp);
      if (!dragRow) return;
      dragRow.classList.remove('is-dragging');
      clearTargets();
      const order = [...stagesEl.querySelectorAll('.kuiper-ws-stage-row')].map(r => r.dataset.stageId);
      const row = dragRow;
      dragRow = null;
      if (!startOrder || JSON.stringify(order) === JSON.stringify(startOrder)) return;
      try {
        await KuiperStore.reorderStages(slug, order, boardStoreOpts());
        await afterBoardDetailMutation(slug);
      } catch (err) {
        ctx.toast?.(err.message, null, 8000, 'error');
        await refreshBoardsPanels();
      }
    };

    const onPointerMove = e => {
      if (!dragRow) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const target = el?.closest?.('.kuiper-ws-stage-row');
      if (!target || target === dragRow || !stagesEl.contains(target)) return;
      clearTargets();
      target.classList.add('is-drop-target');
      const rect = target.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      if (before) stagesEl.insertBefore(dragRow, target);
      else stagesEl.insertBefore(dragRow, target.nextSibling);
    };

    const onPointerUp = () => {
      void finishDrag();
    };

    stagesEl.querySelectorAll('.grab').forEach(grip => {
      grip.onpointerdown = e => {
        if (e.button !== 0) return;
        e.preventDefault();
        dragRow = grip.closest('.kuiper-ws-stage-row');
        if (!dragRow) return;
        startOrder = [...stagesEl.querySelectorAll('.kuiper-ws-stage-row')].map(r => r.dataset.stageId);
        dragRow.classList.add('is-dragging');
        try { grip.setPointerCapture(e.pointerId); } catch (_) { /* ok */ }
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
        document.addEventListener('pointercancel', onPointerUp);
      };
    });
  }

  async function refreshBoardsPanels() {
    const body = boardsBodyScrollEl();
    if (!body?.querySelector('#kuiperWsBoardList')) {
      await renderBoardsTab(body);
      return;
    }
    await withPreservedScroll(async () => {
      syncBoardListSelection();
      const host = body.querySelector('#kuiperWsBoardDetail');
      if (!host || !selectedBoardSlug) return;
      const row = body.querySelector(`.kuiper-ws-board-row[data-board-slug="${CSS.escape(selectedBoardSlug)}"]`);
      const metaName = boardNameFromRow(row);
      await fillBoardDetail(host, selectedBoardSlug, metaName);
    });
  }

  async function renderBoardsTab(body) {
    managedOrgSlug = orgSlug();
    syncOrgInUrl();
    const org = managedOrgSlug;
    const current = boardSlug();
    const boards = await KuiperStore.listOrgBoards(org, { includeArchived: showArchivedEntities }).catch(() => []);
    if (!selectedBoardSlug || !boards.some(b => b.slug === selectedBoardSlug)) {
      selectedBoardSlug = current || boards[0]?.slug || '';
      selectedBoardId = boards.find(b => b.slug === selectedBoardSlug)?.id || null;
    } else {
      selectedBoardId = boards.find(b => b.slug === selectedBoardSlug)?.id || selectedBoardId;
    }
    body.classList.add('kuiper-ws-boards-tab');
    body.innerHTML = `
      <section class="kuiper-ws-section kuiper-ws-section--compact">
        <div class="menu-label">${esc(tr('workspaceAdminNewBoard'))}</div>
        <div class="kuiper-ws-row">
          <input type="text" class="kuiper-ws-input" id="kuiperWsNewBoardName" placeholder="${esc(tr('workspaceAdminBoardName'))}" autocomplete="off">
          <button type="button" class="pill sm" data-act="add-board">${esc(tr('create'))}</button>
        </div>
        <p class="kuiper-hint">${esc(tr('workspaceAdminNewBoardHint'))}</p>
      </section>
      <section class="kuiper-ws-section kuiper-ws-section--compact">
        <div class="kuiper-ws-row kuiper-ws-section-head">
          <div class="menu-label">${esc(tr('workspaceAdminBoardList'))}</div>
          ${archivedToggleHtml('kuiperWsShowArchived', showArchivedEntities)}
        </div>
        <ul class="kuiper-ws-list kuiper-ws-board-list" id="kuiperWsBoardList">
          ${boards.map(b => boardRowHtml(b, current, selectedBoardSlug)).join('')}
        </ul>
      </section>
      <div id="kuiperWsBoardDetail"></div>`;
    wireArchivedToggle(body, 'kuiperWsShowArchived', checked => { showArchivedEntities = checked; });
    wireBoardListHandlers(body);
    const nameInput = body.querySelector('#kuiperWsNewBoardName');
    body.querySelector('[data-act="add-board"]').onclick = () => submitNewBoard(body);
    if (nameInput) {
      nameInput.onkeydown = e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submitNewBoard(body);
        }
      };
    }
    const detailHost = body.querySelector('#kuiperWsBoardDetail');
    if (selectedBoardSlug && detailHost) {
      const meta = boards.find(b => b.slug === selectedBoardSlug);
      await fillBoardDetail(detailHost, selectedBoardSlug, meta?.name || '');
    } else if (detailHost) {
      detailHost.innerHTML = `<p class="kuiper-hint">${esc(tr('workspaceAdminSelectBoardHint'))}</p>`;
    }
  }

  async function fillBoardDetail(hostEl, slug, fallbackName) {
    const st = ctx.state?.();
    const isCurrent = slug === boardSlug();
    const apiKey = boardApiKey(slug);
    const bOpts = boardStoreOpts();
    let membership = { projects: [], stages: [] };
    try {
      membership = await KuiperStore.loadBoardMembership(apiKey, bOpts);
    } catch (err) {
      if (isCurrent) {
        membership = { projects: st?.projects || [], stages: st?.columns || [] };
      } else {
        ctx.toast?.(err.message, null, 8000, 'error');
      }
    }
    const orgProjects = await KuiperStore.listOrgProjects(managedOrgSlug || orgSlug()).catch(() => []);
    const linked = new Set((membership.projects || []).map(p => p.id));
    hostEl.innerHTML = `
      <section class="kuiper-ws-section kuiper-ws-section--compact kuiper-ws-board-detail">
        <div class="menu-label">${esc(tr('workspaceAdminBoardDetail'))} · <span class="faint">${esc(slug)}</span></div>
      </section>
      <div class="kuiper-ws-board-columns">
        <section class="kuiper-ws-board-col kuiper-ws-section kuiper-ws-section--compact kuiper-ws-board-col-stages">
          <div class="menu-label">${esc(tr('stage'))}</div>
          <ul class="kuiper-ws-list kuiper-ws-stages kuiper-ws-board-col-scroll" id="kuiperWsStages"></ul>
          <div class="kuiper-ws-row kuiper-ws-stage-add">
            <input type="text" class="kuiper-ws-input" id="kuiperWsNewStage" placeholder="${esc(tr('workspaceAdminNewStage'))}">
            <button type="button" class="pill sm" id="kuiperWsAddStageBtn">+</button>
          </div>
        </section>
        <section class="kuiper-ws-board-col kuiper-ws-section kuiper-ws-section--compact kuiper-ws-projects-compact">
          <div class="menu-label">${esc(tr('workspaceAdminBoardProjects'))}</div>
          <ul class="kuiper-ws-list kuiper-ws-board-col-scroll" id="kuiperWsBoardProjects"></ul>
        </section>
      </div>`;
    const stagesEl = hostEl.querySelector('#kuiperWsStages');
    const stageRows = membership.stages || (isCurrent ? st?.columns : []) || [];
    stageRows.forEach(s => {
      const li = document.createElement('li');
      li.className = 'kuiper-ws-list-row kuiper-ws-stage-row';
      li.dataset.stageId = s.id;
      li.innerHTML = `<span class="grab" role="button" tabindex="-1" aria-hidden="true" title="${esc(tr('reorder'))}">⠿</span>
        <input type="text" class="kuiper-ws-input" value="${esc(s.name)}" data-stage-id="${esc(s.id)}">
        <button type="button" class="icon sm danger" data-del-stage="${esc(s.id)}">×</button>`;
      stagesEl.append(li);
    });
    wireStageDrag(apiKey, stagesEl);
    stagesEl.querySelectorAll('input').forEach(inp => {
      inp.onchange = async () => {
        await KuiperStore.updateStage(apiKey, inp.dataset.stageId, { name: inp.value.trim() }, bOpts);
        await afterBoardDetailMutation(slug);
      };
    });
    stagesEl.querySelectorAll('[data-del-stage]').forEach(btn => {
      btn.onclick = async () => {
        try {
          await KuiperStore.deleteStage(apiKey, btn.dataset.delStage, bOpts);
          await afterBoardDetailMutation(slug);
        } catch (err) {
          ctx.toast?.(err.message, null, 8000, 'error');
        }
      };
    });
    const addStageInput = hostEl.querySelector('#kuiperWsNewStage');
    const addStageBtn = hostEl.querySelector('#kuiperWsAddStageBtn');
    const submitNewStage = async () => {
      const name = addStageInput?.value.trim();
      if (!name) return;
      try {
        await KuiperStore.createStage(apiKey, name, bOpts);
        if (addStageInput) addStageInput.value = '';
        await afterBoardDetailMutation(slug);
      } catch (err) {
        ctx.toast?.(err.message, null, 8000, 'error');
      }
    };
    if (addStageBtn) addStageBtn.onclick = () => submitNewStage();
    if (addStageInput) {
      addStageInput.onkeydown = e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submitNewStage();
        }
      };
    }
    const projEl = hostEl.querySelector('#kuiperWsBoardProjects');
    for (const p of orgProjects) {
      const li = document.createElement('li');
      li.className = 'kuiper-ws-list-row';
      const on = linked.has(p.id);
      li.innerHTML = `<label class="kuiper-ws-check"><input type="checkbox" data-pid="${esc(p.id)}" ${on ? 'checked' : ''}> <span>${esc(p.name)}</span></label>`;
      projEl.append(li);
    }
    projEl.querySelectorAll('input[type=checkbox]').forEach(cb => {
      cb.onchange = async () => {
        try {
          syncOrgInUrl();
          const linkOpts = boardStoreOpts();
          if (cb.checked) await KuiperStore.linkBoardProject(apiKey, cb.dataset.pid, linkOpts);
          else await KuiperStore.unlinkBoardProject(apiKey, cb.dataset.pid, linkOpts);
          await afterBoardDetailMutation(slug);
        } catch (err) {
          ctx.toast?.(err.message, null, 8000, 'error');
          cb.checked = !cb.checked;
        }
      };
    });
  }

  async function setActiveOrganization(slug) {
    if (typeof KuiperUI !== 'undefined' && KuiperUI.switchOrganization) {
      await KuiperUI.switchOrganization(slug);
      return;
    }
    const u = new URL(location.href);
    u.searchParams.set('org', slug);
    location.assign(u.toString());
  }

  async function renderOrganizationsTab(body) {
    syncOrgInUrl();
    const orgs = await KuiperStore.listOrganizations({ includeArchived: showArchivedEntities });
    const active = orgSlug();
    body.innerHTML = `
      <section class="kuiper-ws-section kuiper-ws-section--compact">
        <div class="menu-label">${esc(tr('workspaceAdminNewOrganization'))}</div>
        <div class="kuiper-ws-row">
          <input type="text" class="kuiper-ws-input" id="kuiperWsNewOrgName" placeholder="${esc(tr('workspaceAdminOrgName'))}" autocomplete="off">
          <button type="button" class="pill sm" data-act="add-org">${esc(tr('create'))}</button>
        </div>
        <p class="kuiper-hint">${esc(tr('workspaceAdminNewOrgHint'))}</p>
      </section>
      <section class="kuiper-ws-section kuiper-ws-section--compact">
        <div class="kuiper-ws-row kuiper-ws-section-head">
          <div class="menu-label">${esc(tr('workspaceAdminOrgList'))}</div>
          ${archivedToggleHtml('kuiperWsShowArchived', showArchivedEntities)}
        </div>
        <ul class="kuiper-ws-list" id="kuiperWsOrgList"></ul>
      </section>`;
    wireArchivedToggle(body, 'kuiperWsShowArchived', checked => { showArchivedEntities = checked; });
    const ul = body.querySelector('#kuiperWsOrgList');
    for (const o of orgs) {
      const isActive = o.slug === active;
      const isArchived = archivedFlag(o);
      const li = document.createElement('li');
      li.className = `kuiper-ws-list-row kuiper-ws-entity-row kuiper-ws-org-row${isActive ? ' is-active-org' : ''}${isArchived ? ' is-archived-entity' : ''}`;
      li.dataset.orgSlug = o.slug;
      const activePart = isActive
        ? `<span class="kuiper-ws-board-current">${esc(tr('workspaceAdminActiveOrg'))}</span>`
        : `<button type="button" class="pill sm" data-act="set-active-org" data-org-slug="${esc(o.slug)}">${esc(tr('workspaceAdminSetActiveOrg'))}</button>`;
      const archBadge = isArchived
        ? `<span class="kuiper-ws-archived-badge">${esc(tr('workspaceAdminArchivedBadge'))}</span>`
        : '';
      const actions = entityActionButtons({
        archived: isArchived,
        archiveAct: 'archive-org',
        restoreAct: 'restore-org',
        deleteAct: 'delete-org',
        slugAttr: 'org-slug',
        slug: o.slug,
      });
      li.innerHTML = `<input type="text" class="kuiper-ws-input kuiper-ws-entity-name" value="${esc(o.name)}" data-org-slug="${esc(o.slug)}">
        <span class="faint kuiper-ws-entity-slug" title="${esc(o.slug)}">${esc(o.slug)}</span>
        ${wsEntityCodeHtml(o.code, o.slug)}
        <div class="kuiper-ws-entity-status">${archBadge}${activePart}</div>
        ${actions}`;
      ul.append(li);
    }
    ul.querySelectorAll('input[data-org-slug]').forEach(inp => {
      inp.onchange = async () => {
        const name = inp.value.trim();
        if (!name) return;
        await KuiperStore.patchOrganization(inp.dataset.orgSlug, { name });
        await ctx.loadKuiperBoard?.();
        await refreshNavSidebar();
        renderBody();
      };
    });
    ul.querySelectorAll('[data-act="set-active-org"]').forEach(btn => {
      btn.onclick = async () => {
        await setActiveOrganization(btn.dataset.orgSlug);
        await renderBody();
      };
    });
    ul.querySelectorAll('[data-act="archive-org"]').forEach(btn => {
      btn.onclick = async () => {
        const slug = btn.dataset.orgSlug;
        const o = orgs.find(x => x.slug === slug);
        const name = o?.name || slug;
        if (!await confirmArchiveEntity(name)) return;
        try {
          await KuiperStore.patchOrganization(slug, { archived: true });
          if (slug === active) {
            const fallback = orgs.find(x => x.slug !== slug && !archivedFlag(x))?.slug;
            if (fallback) await setActiveOrganization(fallback);
            else {
              const u = new URL(location.href);
              u.searchParams.delete('board');
              history.replaceState(null, '', `${u.pathname}${u.search}${u.hash}`);
              ctx.resetOrgContext?.({ slug });
            }
          }
          await refreshNavSidebar();
          ctx.toast?.(tr('workspaceAdminArchivedToast'));
          await renderBody();
        } catch (err) {
          ctx.toast?.(err.message, null, 8000, 'error');
        }
      };
    });
    ul.querySelectorAll('[data-act="restore-org"]').forEach(btn => {
      btn.onclick = async () => {
        const slug = btn.dataset.orgSlug;
        try {
          await KuiperStore.patchOrganization(slug, { archived: false });
          await refreshNavSidebar();
          ctx.toast?.(tr('restore'));
          await renderBody();
        } catch (err) {
          ctx.toast?.(err.message, null, 8000, 'error');
        }
      };
    });
    ul.querySelectorAll('[data-act="delete-org"]').forEach(btn => {
      btn.onclick = async () => {
        const slug = btn.dataset.orgSlug;
        const o = orgs.find(x => x.slug === slug);
        const name = o?.name || slug;
        if (!await confirmDeleteEntity(name)) return;
        try {
          await KuiperStore.deleteOrganization(slug);
          if (slug === active) {
            const fallback = orgs.find(x => x.slug !== slug)?.slug;
            if (fallback) await setActiveOrganization(fallback);
            else ctx.resetOrgContext?.({});
          }
          await refreshNavSidebar();
          ctx.toast?.(tr('workspaceAdminDeletedToast'));
          await renderBody();
        } catch (err) {
          ctx.toast?.(err.message, null, 8000, 'error');
        }
      };
    });
    body.querySelector('[data-act="add-org"]').onclick = async () => {
      const name = body.querySelector('#kuiperWsNewOrgName')?.value.trim();
      if (!name) {
        ctx.toast?.(tr('workspaceAdminOrgNameRequired'), null, undefined, 'warning');
        return;
      }
      try {
        const created = await KuiperStore.createOrganization({ name });
        body.querySelector('#kuiperWsNewOrgName').value = '';
        await setActiveOrganization(created.slug);
        if (typeof KuiperUI !== 'undefined') await KuiperUI.loadNavigation?.();
        await renderBody();
      } catch (err) {
        ctx.toast?.(err.message, null, 8000, 'error');
      }
    };
  }

  async function onActiveOrgChanged(slug) {
    if (tab === 'organizations') await renderBody();
    else if (tab === 'boards') await refreshBoardsPanels();
    if (!selectedBoardSlug || selectedBoardSlug === boardSlug()) {
      selectedBoardSlug = boardSlug();
    }
  }

  async function renderProjectsTab(body) {
    syncOrgInUrl();
    const slug = orgSlug();
    body.classList.add('kuiper-ws-boards-tab');
    const projects = await KuiperStore.listOrgProjects(slug, { includeArchived: showArchivedProjects });
    const tags = slug
      ? await KuiperStore.listOrgTags(slug, { includeArchived: showArchivedTags }).catch(() => [])
      : [];
    body.innerHTML = `
      <section class="kuiper-ws-section kuiper-ws-section--compact">
        <div class="menu-label">${esc(tr('workspaceAdminNewProject'))}</div>
        <div class="kuiper-ws-row">
          <input type="text" class="kuiper-ws-input" id="kuiperWsNewProj" placeholder="${esc(tr('workspaceAdminNewProject'))}" autocomplete="off">
          <button type="button" class="pill sm" data-act="add-project">${esc(tr('create'))}</button>
        </div>
        <p class="kuiper-hint">${esc(tr('workspaceAdminOneOrgPerProject'))}</p>
      </section>
      <section class="kuiper-ws-section kuiper-ws-section--compact">
        <div class="kuiper-ws-row kuiper-ws-section-head">
          <div class="menu-label">${esc(tr('projects'))}</div>
          ${archivedToggleHtml('kuiperWsShowArchivedProjects', showArchivedProjects)}
        </div>
        <ul class="kuiper-ws-list kuiper-ws-board-list" id="kuiperWsProjects"></ul>
      </section>
      <section class="kuiper-ws-section kuiper-ws-section--compact kuiper-ws-tags-block">
        <div class="kuiper-ws-row kuiper-ws-section-head">
          <div class="menu-label">${esc(tr('tags'))}</div>
          ${archivedToggleHtml('kuiperWsShowArchivedTags', showArchivedTags)}
        </div>
        <p class="kuiper-hint">${esc(tr('workspaceAdminTagsOrgHint'))}</p>
        <div class="kuiper-ws-row">
          <input type="text" class="kuiper-ws-input" id="kuiperWsNewTag" placeholder="${esc(tr('workspaceAdminNewTag'))}" autocomplete="off" spellcheck="false">
          <button type="button" class="pill sm" data-act="add-tag">${esc(tr('create'))}</button>
        </div>
        <ul class="kuiper-ws-list kuiper-ws-board-list" id="kuiperWsTags"></ul>
      </section>`;
    wireArchivedToggle(body, 'kuiperWsShowArchivedProjects', checked => { showArchivedProjects = checked; });
    wireArchivedToggle(body, 'kuiperWsShowArchivedTags', checked => { showArchivedTags = checked; });
    wireCatalogRowActionFocus(body);
    const ul = body.querySelector('#kuiperWsProjects');
    ul.innerHTML = projects.map((p, index) => catalogEntityRowHtml({
      kind: 'project',
      id: p.id,
      name: p.name,
      code: p.code,
      slug: p.slug,
      color: wsEntityColor(p.color, wsColorByIndex(index)),
      colorKind: 'project',
      isArchived: archivedFlag(p),
      archiveAct: 'archive-project',
      restoreAct: 'restore-project',
      deleteAct: 'delete-project',
    })).join('');
    ul.querySelectorAll('input[data-project-id]').forEach(inp => {
      inp.addEventListener('change', async () => {
        const name = inp.value.trim();
        if (!name) return;
        await KuiperStore.patchProject(inp.dataset.projectId, { name });
        await ctx.loadKuiperBoard?.();
        await refreshNavSidebar();
        renderBody();
      });
    });
    ul.querySelectorAll('[data-act="archive-project"]').forEach(btn => {
      btn.onclick = async e => {
        e.preventDefault();
        e.stopPropagation();
        const id = entityIdFromRow(btn, 'project');
        const p = projects.find(x => x.id === id);
        const name = p?.name || id;
        if (!await confirmArchiveEntity(name)) return;
        try {
          await KuiperStore.patchProject(id, { archived: true });
          ctx.toast?.(tr('workspaceAdminArchivedToast'));
          await reloadBoard();
          await renderBody();
        } catch (err) {
          ctx.toast?.(err.message, null, 8000, 'error');
        }
      };
    });
    ul.querySelectorAll('[data-act="restore-project"]').forEach(btn => {
      btn.onclick = async e => {
        e.preventDefault();
        e.stopPropagation();
        const id = entityIdFromRow(btn, 'project');
        try {
          await KuiperStore.patchProject(id, { archived: false });
          ctx.toast?.(tr('restore'));
          await reloadBoard();
          await renderBody();
        } catch (err) {
          ctx.toast?.(err.message, null, 8000, 'error');
        }
      };
    });
    ul.querySelectorAll('[data-act="delete-project"]').forEach(btn => {
      btn.onclick = async e => {
        e.preventDefault();
        e.stopPropagation();
        const id = entityIdFromRow(btn, 'project');
        const p = projects.find(x => x.id === id);
        const name = p?.name || id;
        try {
          const impact = await KuiperStore.projectDeletionImpact(id);
          const message = formatProjectDeletionMessage(impact);
          if (!await confirmDeleteEntity(name, { message })) return;
          await KuiperStore.deleteProject(id, { force: true });
          ctx.toast?.(tr('workspaceAdminDeletedToast'));
          await reloadBoard();
          await renderBody();
        } catch (err) {
          ctx.toast?.(err.message, null, 8000, 'error');
        }
      };
    });
    const submitNewProject = async () => {
      const name = body.querySelector('#kuiperWsNewProj')?.value.trim();
      if (!name) return;
      await KuiperStore.createOrgProject(orgSlug(), { name });
      body.querySelector('#kuiperWsNewProj').value = '';
      await reloadBoard();
      renderBody();
    };
    body.querySelector('[data-act="add-project"]').onclick = () => { void submitNewProject(); };
    bindSubmitOnEnter(body.querySelector('#kuiperWsNewProj'), submitNewProject);

    const tagUl = body.querySelector('#kuiperWsTags');
    tagUl.innerHTML = tags.map((tag, index) => catalogEntityRowHtml({
      kind: 'tag',
      id: tag.id,
      name: tag.name,
      slug: '',
      color: wsEntityColor(tag.color, wsColorByName(tag.name) || wsColorByIndex(index + 2)),
      colorKind: 'tag',
      isArchived: archivedFlag(tag),
      archiveAct: 'archive-tag',
      restoreAct: 'restore-tag',
      deleteAct: 'delete-tag',
    })).join('');
    bindTagNameInputs(body, { onRenamed: async () => { await reloadBoard(); await renderBody(); } });
    bindNewTagInput(body.querySelector('#kuiperWsNewTag'));
    tagUl.querySelectorAll('[data-act="archive-tag"]').forEach(btn => {
      btn.onclick = async e => {
        e.preventDefault();
        e.stopPropagation();
        const id = entityIdFromRow(btn, 'tag');
        if (!id) return;
        const tag = tags.find(x => x.id === id);
        const name = tag?.name || btn.closest('.kuiper-ws-catalog-row')?.dataset.entityName || id;
        if (!await confirmArchiveEntity(name)) return;
        try {
          await KuiperStore.patchTag(id, { archived: true });
          ctx.toast?.(tr('workspaceAdminArchivedToast'));
          await reloadBoard();
          await renderBody();
        } catch (err) {
          ctx.toast?.(err.message, null, 8000, 'error');
        }
      };
    });
    tagUl.querySelectorAll('[data-act="restore-tag"]').forEach(btn => {
      btn.onclick = async e => {
        e.preventDefault();
        e.stopPropagation();
        const id = entityIdFromRow(btn, 'tag');
        if (!id) return;
        try {
          await KuiperStore.patchTag(id, { archived: false });
          ctx.toast?.(tr('restore'));
          await reloadBoard();
          await renderBody();
        } catch (err) {
          ctx.toast?.(err.message, null, 8000, 'error');
        }
      };
    });
    tagUl.querySelectorAll('[data-act="delete-tag"]').forEach(btn => {
      btn.onclick = async e => {
        e.preventDefault();
        e.stopPropagation();
        const id = entityIdFromRow(btn, 'tag');
        const tag = tags.find(x => x.id === id);
        const name = tag?.name || id;
        try {
          const impact = await KuiperStore.tagDeletionImpact(id);
          const message = formatTagDeletionMessage(impact);
          if (!await confirmDeleteEntity(name, { message })) return;
          await KuiperStore.deleteTag(id);
          ctx.toast?.(tr('workspaceAdminDeletedToast'));
          await reloadBoard();
          await renderBody();
        } catch (err) {
          ctx.toast?.(err.message, null, 8000, 'error');
        }
      };
    });
    const submitNewTag = async () => {
      const raw = body.querySelector('#kuiperWsNewTag')?.value;
      const name = normalizeTagInput(raw);
      if (!name) {
        ctx.toast?.(tr('workspaceAdminTagNameRequired'), null, 4000, 'warning');
        return;
      }
      try {
        await KuiperStore.createOrgTag(slug, name);
        body.querySelector('#kuiperWsNewTag').value = '';
        await reloadBoard();
        renderBody();
      } catch (err) {
        ctx.toast?.(err.message, null, 8000, 'error');
      }
    };
    body.querySelector('[data-act="add-tag"]').onclick = () => { void submitNewTag(); };
    bindSubmitOnEnter(body.querySelector('#kuiperWsNewTag'), submitNewTag);

    wireWsColorPickers(body, {
      async onProjectColor(id, color) {
        try {
          await KuiperStore.patchProject(id, { color });
          await reloadBoard();
        } catch (err) {
          ctx.toast?.(err.message, null, 8000, 'error');
        }
      },
      async onTagColor(id, color) {
        try {
          await KuiperStore.patchTag(id, { color });
          await reloadBoard();
        } catch (err) {
          ctx.toast?.(err.message, null, 8000, 'error');
        }
      },
    });
  }

  function wsFormatDateLabel(ymd) {
    if (!ymd) return '—';
    if (typeof KuiperDateTimePicker !== 'undefined' && KuiperDateTimePicker.formatDateDisplay) {
      return KuiperDateTimePicker.formatDateDisplay(ymd);
    }
    return ymd;
  }

  function ensureWsDatePicker() {
    if (typeof KuiperDateTimePicker === 'undefined') return;
    KuiperDateTimePicker.init?.({ tr, locale: () => ctx.locale?.() || 'es' });
  }

  function wireWsDateTrigger(root, { hiddenSel, btnSel, onPick }) {
    const hidden = root.querySelector(hiddenSel);
    const btn = root.querySelector(btnSel);
    if (!hidden || !btn) return null;
    const sync = () => {
      const val = hidden.value?.trim() || '';
      const span = btn.querySelector('.kuiper-dt-trigger-val');
      if (span) span.textContent = wsFormatDateLabel(val);
      btn.classList.toggle('is-empty', !val);
    };
    sync();
    btn.onclick = e => {
      e.stopPropagation();
      if (typeof KuiperDateTimePicker === 'undefined') return;
      KuiperDateTimePicker.openDate({
        anchor: btn,
        value: hidden.value || undefined,
        scrim: false,
        clientX: e.clientX,
        clientY: e.clientY,
        onPick: ymd => {
          hidden.value = ymd || '';
          sync();
          onPick?.(ymd || '');
        },
      });
    };
    return { hidden, sync };
  }

  function sprintDraftActionButtonsHtml() {
    const deleteLabel = tr('cancel');
    return `<div class="kuiper-ws-entity-actions">
      <button type="button" class="icon sm kuiper-ws-entity-icon" disabled title="${esc(tr('workspaceAdminSprintDraftArchiveHint'))}" aria-label="${esc(tr('workspaceAdminSprintDraftArchiveHint'))}">${WS_ICON.archive}</button>
      <button type="button" class="icon sm kuiper-ws-entity-icon danger" data-act="cancel-sprint-draft" title="${esc(deleteLabel)}" aria-label="${esc(deleteLabel)}">${WS_ICON.delete}</button>
    </div>`;
  }

  function sprintSortSelectHtml() {
    return `<div class="kuiper-ws-sprint-sort">
      <span class="kuiper-ws-sprint-sort-lbl">${esc(tr('workspaceAdminSprintSort'))}</span>
      <div class="kuiper-ctrl kuiper-ws-sprint-sort-ctrl" id="kuiperWsSprintSortCtrl">
        <button type="button" class="pill sm kuiper-drop-btn" aria-haspopup="listbox" aria-expanded="false">
          <span class="kuiper-drop-label"></span>
        </button>
        <div class="menu kuiper-drop-menu" role="listbox" hidden>
          <div class="menu-label">${esc(tr('workspaceAdminSprintSort'))}</div>
          <div class="kuiper-drop-items"></div>
        </div>
      </div>
    </div>`;
  }

  function wireSprintSortDropdown() {
    if (typeof KuiperUI === 'undefined' || !KuiperUI.updateDropdown) return;
    const modes = [
      ['startDesc', 'workspaceAdminSprintSortStartDesc'],
      ['start', 'workspaceAdminSprintSortStart'],
      ['endDesc', 'workspaceAdminSprintSortEndDesc'],
      ['end', 'workspaceAdminSprintSortEnd'],
      ['name', 'workspaceAdminSprintSortName'],
      ['nameDesc', 'workspaceAdminSprintSortNameDesc'],
      ['slug', 'workspaceAdminSprintSortSlug'],
      ['slugDesc', 'workspaceAdminSprintSortSlugDesc'],
      ['status', 'workspaceAdminSprintSortStatus'],
      ['board', 'workspaceAdminSprintSortBoard'],
    ];
    const options = modes.map(([value, key]) => ({ value, label: tr(key) }));
    KuiperUI.updateDropdown('kuiperWsSprintSortCtrl', options, sprintListSort, value => {
      sprintListSort = value || 'startDesc';
      void renderBody();
    });
  }

  function applySprintRowSelection(body, sprints, sprintId) {
    if (selectedSprintId === sprintId) {
      sprintDetailExpanded = !sprintDetailExpanded;
    } else {
      selectedSprintId = sprintId;
      sprintDetailExpanded = true;
    }
    withPreservedScroll(async () => {
      await refreshSprintDetailPanels(body, sprints);
    });
  }

  function readWsSprintProjectIds(root) {
    const ids = [];
    root.querySelectorAll('.kuiper-ws-sprint-projects input[type=checkbox]:checked').forEach(cb => {
      if (cb.dataset.pid) ids.push(cb.dataset.pid);
    });
    return ids;
  }

  function syncSprintSelection(body) {
    body?.querySelectorAll('.kuiper-ws-sprint-block').forEach(block => {
      const id = block.dataset.sprintId;
      const selected = id === selectedSprintId;
      const row = block.querySelector('.kuiper-ws-sprint-row');
      row?.classList.toggle('is-selected', selected);
      block.classList.toggle('is-selected', selected);
      const expanded = selected && sprintDetailExpanded;
      block.classList.toggle('is-expanded', expanded);
      const panel = block.querySelector('.kuiper-ws-sprint-detail-panel');
      if (panel) panel.hidden = !expanded;
      const toggle = block.querySelector('[data-act="toggle-sprint-detail"]');
      if (toggle) {
        const expanded = selected && sprintDetailExpanded;
        toggle.classList.toggle('is-open', expanded);
        toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      }
    });
  }

  async function refreshSprintDetailPanels(body, sprints) {
    syncSprintSelection(body);
    const blocks = body?.querySelectorAll('.kuiper-ws-sprint-block') || [];
    for (const block of blocks) {
      const panel = block.querySelector('.kuiper-ws-sprint-detail-panel');
      if (!panel) continue;
      if (block.dataset.sprintId === selectedSprintId && sprintDetailExpanded) {
        await fillSprintDetail(panel, sprints);
      } else {
        panel.innerHTML = '';
      }
    }
  }

  function sprintNameFromRow(row) {
    return row?.querySelector('.kuiper-ws-sprint-name')?.value.trim()
      || row?.dataset.sprintName
      || '';
  }

  function sprintSlugFromRow(row) {
    return row?.querySelector('.kuiper-ws-sprint-slug')?.value.trim()
      || row?.dataset.sprintSlug
      || '';
  }

  function sprintDatesBandHtml({ start, end, startBtnClass, endBtnClass, startHiddenClass, endHiddenClass, startId, endId, startBtnId, endBtnId }) {
    const startBtnExtra = startBtnClass ? ` ${startBtnClass}` : '';
    const endBtnExtra = endBtnClass ? ` ${endBtnClass}` : '';
    const startIdAttr = startId ? ` id="${startId}"` : '';
    const endIdAttr = endId ? ` id="${endId}"` : '';
    const startBtnIdAttr = startBtnId ? ` id="${startBtnId}"` : '';
    const endBtnIdAttr = endBtnId ? ` id="${endBtnId}"` : '';
    const startHiddenCls = startHiddenClass || 'kuiper-ws-sprint-start-val';
    const endHiddenCls = endHiddenClass || 'kuiper-ws-sprint-end-val';
    return `
      <div class="kuiper-ws-sprint-row-dates" role="group" aria-label="${esc(tr('scheduleSection'))}">
        <span class="kuiper-ws-sprint-dates-lbl">${esc(tr('scheduleStartShort'))}</span>
        <button type="button" class="kuiper-dt-trigger${startBtnExtra}"${startBtnIdAttr} data-placeholder="—" aria-label="${esc(tr('scheduleStart'))}">
          <span class="kuiper-dt-trigger-val"></span>
        </button>
        <input type="hidden" class="${startHiddenCls}"${startIdAttr} value="${esc(start)}">
        <span class="kuiper-ws-sprint-dates-sep" aria-hidden="true">–</span>
        <span class="kuiper-ws-sprint-dates-lbl">${esc(tr('scheduleEndShort'))}</span>
        <button type="button" class="kuiper-dt-trigger${endBtnExtra}"${endBtnIdAttr} data-placeholder="—" aria-label="${esc(tr('scheduleEnd'))}">
          <span class="kuiper-dt-trigger-val"></span>
        </button>
        <input type="hidden" class="${endHiddenCls}"${endIdAttr} value="${esc(end)}">
      </div>`;
  }

  function sprintDraftRowHtml(name, start, end) {
    return `<li class="kuiper-ws-sprint-block kuiper-ws-sprint-draft is-selected" data-sprint-draft="1">
      <div class="kuiper-ws-board-row kuiper-ws-sprint-row kuiper-ws-catalog-row is-selected">
        <div class="kuiper-ws-sprint-row-lead"><span class="kuiper-ws-sprint-row-lead-spacer" aria-hidden="true"></span></div>
        <div class="kuiper-ws-board-select kuiper-ws-catalog-select kuiper-ws-board-select-main">
          <span class="kuiper-ws-catalog-name-wrap kuiper-ws-sprint-name-wrap">
            <input type="text" class="kuiper-ws-input kuiper-ws-catalog-name kuiper-ws-sprint-name kuiper-ws-sprint-draft-name" value="${esc(name)}" placeholder="${esc(tr('sprint'))}" autocomplete="off">
          </span>
        </div>
        <div class="kuiper-ws-sprint-ident-col" aria-hidden="true"></div>
        <div class="kuiper-ws-sprint-row-trail">
        ${sprintDatesBandHtml({ start, end, startBtnClass: 'kuiper-ws-sprint-draft-start-btn', endBtnClass: 'kuiper-ws-sprint-draft-end-btn', startHiddenClass: 'kuiper-ws-sprint-draft-start-val', endHiddenClass: 'kuiper-ws-sprint-draft-end-val' })}
        <div class="kuiper-ws-sprint-row-meta" aria-hidden="true"></div>
        <div class="kuiper-ws-board-row-actions kuiper-ws-sprint-row-actions">
          ${sprintDraftActionButtonsHtml()}
        </div>
        </div>
      </div>
    </li>`;
  }

  function sprintRowHtml(s, selectedId) {
    const start = s.start_date || s.startDate || '';
    const end = s.end_date || s.endDate || '';
    const slug = s.slug || '';
    const code = s.code || s.sprintCode || '';
    const isSelected = s.id === selectedId;
    const isArchived = archivedFlag(s);
    const classes = [
      'kuiper-ws-board-row',
      'kuiper-ws-sprint-row',
      'kuiper-ws-catalog-row',
      isSelected ? 'is-selected' : '',
      isArchived ? ' is-archived-entity' : '',
      !isSelected && (isArchived || s.status === 'closed') ? 'kuiper-ws-board-row--muted' : '',
    ].filter(Boolean).join(' ');
    const activeBadge = s.status === 'active'
      ? `<span class="kuiper-ws-board-current">${esc(tr('sprintActive'))}</span>`
      : '';
    const archBadge = isArchived
      ? `<span class="kuiper-ws-archived-badge">${esc(tr('workspaceAdminArchivedBadge'))}</span>`
      : '';
    const actions = entityActionButtons({
      archived: isArchived,
      archiveAct: 'archive-sprint',
      restoreAct: 'restore-sprint',
      deleteAct: 'delete-sprint',
      slugAttr: 'sprint-id',
      slug: s.id,
    });
    const toggleExpanded = isSelected && sprintDetailExpanded;
    const toggleDetail = `<button type="button" class="icon sm kuiper-ws-sprint-toggle-detail${toggleExpanded ? ' is-open' : ''}" data-act="toggle-sprint-detail" data-sprint-id="${esc(s.id)}" aria-expanded="${toggleExpanded ? 'true' : 'false'}" title="${esc(tr('workspaceAdminSprintCollapse'))}" aria-label="${esc(tr('workspaceAdminSprintCollapse'))}">▾</button>`;
    const identBadge = wsEntityCodeHtml(code || slug, slug || code);
    return `<li class="kuiper-ws-sprint-block${isSelected ? ' is-selected' : ''}${isSelected && sprintDetailExpanded ? ' is-expanded' : ''}" data-sprint-id="${esc(s.id)}" data-sprint-name="${esc(s.name)}" data-sprint-slug="${esc(slug)}">
      <div class="${classes}" data-sprint-id="${esc(s.id)}">
      <div class="kuiper-ws-sprint-row-lead">${toggleDetail}</div>
      <div class="kuiper-ws-board-select kuiper-ws-catalog-select kuiper-ws-board-select-main" data-sprint-id="${esc(s.id)}">
        <span class="kuiper-ws-catalog-name-wrap kuiper-ws-sprint-name-wrap">
          <input type="text" class="kuiper-ws-input kuiper-ws-catalog-name kuiper-ws-sprint-name" value="${esc(s.name)}" autocomplete="off" spellcheck="false">
        </span>
      </div>
      <div class="kuiper-ws-sprint-ident-col">${identBadge}</div>
      <div class="kuiper-ws-sprint-row-trail">
      ${sprintDatesBandHtml({ start, end, startBtnClass: 'kuiper-ws-sprint-start-btn', endBtnClass: 'kuiper-ws-sprint-end-btn' })}
      <div class="kuiper-ws-sprint-row-meta">${archBadge}${activeBadge}</div>
      <div class="kuiper-ws-board-row-actions kuiper-ws-sprint-row-actions">
        ${actions}
      </div>
      </div>
      </div>
      <div class="kuiper-ws-sprint-detail-panel"${isSelected && sprintDetailExpanded ? '' : ' hidden'}></div>
    </li>`;
  }

  async function patchSprintDatesFromRow(row, sprint) {
    const start = row.querySelector('.kuiper-ws-sprint-start-val')?.value?.trim();
    const end = row.querySelector('.kuiper-ws-sprint-end-val')?.value?.trim();
    const prevStart = sprint.start_date || sprint.startDate || '';
    const prevEnd = sprint.end_date || sprint.endDate || '';
    const check = BoardCore.validateSchedule(start, end);
    if (!check.ok) {
      ctx.toast?.(tr('scheduleInvalidRange'), null, undefined, 'warning');
      const hStart = row.querySelector('.kuiper-ws-sprint-start-val');
      const hEnd = row.querySelector('.kuiper-ws-sprint-end-val');
      if (hStart) hStart.value = prevStart;
      if (hEnd) hEnd.value = prevEnd;
      wireWsDateTrigger(row, { hiddenSel: '.kuiper-ws-sprint-start-val', btnSel: '.kuiper-ws-sprint-start-btn' });
      wireWsDateTrigger(row, { hiddenSel: '.kuiper-ws-sprint-end-val', btnSel: '.kuiper-ws-sprint-end-btn' });
      return;
    }
    if (start === prevStart && end === prevEnd) return;
    try {
      await KuiperStore.patchSprint(sprint.id, { start_date: start, end_date: end });
      sprint.start_date = start;
      sprint.end_date = end;
      await reloadBoard();
    } catch (err) {
      ctx.toast?.(err.message, null, 8000, 'error');
    }
  }

  function wireSprintRows(body, sprints) {
    const ul = body.querySelector('#kuiperWsSprintList');
    if (!ul) return;
    wireCatalogRowActionFocus(body);
    ul.querySelectorAll('.kuiper-ws-sprint-row[data-sprint-id]').forEach(row => {
      row.addEventListener('click', e => {
        if (e.target.closest('input, textarea, select, .kuiper-dt-trigger, .kuiper-ws-entity-actions, [data-act="toggle-sprint-detail"]')) return;
        const id = row.dataset.sprintId;
        if (!id) return;
        applySprintRowSelection(body, sprints, id);
      });
    });
    ul.querySelectorAll('[data-act="toggle-sprint-detail"]').forEach(btn => {
      btn.onclick = e => {
        e.stopPropagation();
        const id = btn.dataset.sprintId;
        if (!id) return;
        applySprintRowSelection(body, sprints, id);
      };
    });
    ul.querySelectorAll('.kuiper-ws-sprint-row').forEach(row => {
      const id = row.dataset.sprintId;
      const sprint = sprints.find(s => s.id === id);
      if (!sprint) return;

      const nameInp = row.querySelector('.kuiper-ws-sprint-name');
      nameInp?.addEventListener('change', async () => {
        const name = nameInp.value.trim();
        const prev = row.dataset.sprintName || sprint.name;
        if (!name) {
          nameInp.value = prev;
          return;
        }
        if (name === prev) return;
        try {
          await KuiperStore.patchSprint(sprint.id, { name });
          sprint.name = name;
          row.dataset.sprintName = name;
          await reloadBoard();
        } catch (err) {
          ctx.toast?.(err.message, null, 8000, 'error');
          nameInp.value = prev;
        }
      });

      wireWsDateTrigger(row, {
        hiddenSel: '.kuiper-ws-sprint-start-val',
        btnSel: '.kuiper-ws-sprint-start-btn',
        onPick: () => { patchSprintDatesFromRow(row, sprint); },
      });
      wireWsDateTrigger(row, {
        hiddenSel: '.kuiper-ws-sprint-end-val',
        btnSel: '.kuiper-ws-sprint-end-btn',
        onPick: () => { patchSprintDatesFromRow(row, sprint); },
      });
    });

    body.querySelectorAll('[data-act="archive-sprint"]').forEach(btn => {
      btn.onclick = async e => {
        e.stopPropagation();
        const id = btn.dataset.sprintId;
        const row = btn.closest('.kuiper-ws-sprint-row');
        const name = sprintNameFromRow(row) || id;
        if (!await confirmArchiveEntity(name)) return;
        try {
          await KuiperStore.patchSprint(id, { archived: true });
          ctx.toast?.(tr('workspaceAdminArchivedToast'));
          if (selectedSprintId === id) selectedSprintId = null;
          sprintDetailExpanded = false;
          await reloadBoard();
          await renderBody();
        } catch (err) {
          ctx.toast?.(err.message, null, 8000, 'error');
        }
      };
    });
    body.querySelectorAll('[data-act="restore-sprint"]').forEach(btn => {
      btn.onclick = async e => {
        e.stopPropagation();
        const id = btn.dataset.sprintId;
        try {
          await KuiperStore.patchSprint(id, { archived: false });
          ctx.toast?.(tr('restore'));
          await reloadBoard();
          await renderBody();
        } catch (err) {
          ctx.toast?.(err.message, null, 8000, 'error');
        }
      };
    });
    body.querySelectorAll('[data-act="delete-sprint"]').forEach(btn => {
      btn.onclick = async e => {
        e.stopPropagation();
        const id = btn.dataset.sprintId;
        const row = btn.closest('.kuiper-ws-sprint-row');
        const name = sprintNameFromRow(row) || id;
        if (!await confirmDeleteEntity(name, { message: tr('workspaceAdminDeleteSprintMsg') })) return;
        try {
          await KuiperStore.deleteSprint(id);
          if (selectedSprintId === id) {
            selectedSprintId = null;
            sprintDetailExpanded = false;
          }
          await reloadBoard();
          await renderBody();
        } catch (err) {
          ctx.toast?.(err.message, null, 8000, 'error');
        }
      };
    });
  }

  async function fillSprintDetail(hostEl, sprints) {
    if (!hostEl) return;
    const projects = await KuiperStore.listOrgProjects(managedOrgSlug || orgSlug()).catch(() => []);
    const sprint = sprints.find(s => s.id === selectedSprintId);
    if (!sprint) {
      hostEl.innerHTML = '';
      return;
    }
    const linked = new Set(sprint.project_ids || []);
    const status = sprint.status === 'planned' ? 'inactive' : (sprint.status || 'inactive');
    hostEl.innerHTML = `
      <div class="kuiper-ws-board-columns kuiper-ws-sprint-detail-inner">
        <section class="kuiper-ws-board-col kuiper-ws-section kuiper-ws-section--compact">
          <div class="kuiper-ws-row kuiper-ws-section-head">
            <div class="menu-label">${esc(tr('workspaceAdminSprintStatus'))}</div>
          </div>
          <nav class="seg kuiper-ws-sprint-status" role="tablist" aria-label="${esc(tr('workspaceAdminSprintStatus'))}">
            <button type="button" data-status="inactive" aria-pressed="${status === 'inactive'}">${esc(tr('sprintStatusInactive'))}</button>
            <button type="button" data-status="active" aria-pressed="${status === 'active'}">${esc(tr('sprintStatusActive'))}</button>
            <button type="button" data-status="closed" aria-pressed="${status === 'closed'}">${esc(tr('sprintStatusClosed'))}</button>
          </nav>
        </section>
        <section class="kuiper-ws-board-col kuiper-ws-section kuiper-ws-section--compact kuiper-ws-projects-compact kuiper-ws-sprint-projects-col">
          <div class="menu-label">${esc(tr('workspaceAdminSprintProjects'))}</div>
          <ul class="kuiper-ws-list kuiper-ws-sprint-projects"></ul>
        </section>
      </div>`;

    hostEl.querySelectorAll('.kuiper-ws-sprint-status button').forEach(btn => {
      btn.onclick = async () => {
        const next = btn.dataset.status;
        if (!next || next === status) return;
        try {
          await KuiperStore.patchSprint(sprint.id, { status: next });
          await reloadBoard();
          renderBody();
        } catch (err) {
          ctx.toast?.(err.message, null, 8000, 'error');
        }
      };
    });

    const projEl = hostEl.querySelector('.kuiper-ws-sprint-projects');
    for (const p of projects) {
      const li = document.createElement('li');
      li.className = 'kuiper-ws-list-row';
      const on = linked.has(p.id);
      li.innerHTML = `<label class="kuiper-ws-check"><input type="checkbox" data-pid="${esc(p.id)}" ${on ? 'checked' : ''}> <span>${esc(p.name)}</span></label>`;
      projEl.append(li);
    }
    projEl.querySelectorAll('input[type=checkbox]').forEach(cb => {
      cb.onchange = async () => {
        const project_ids = readWsSprintProjectIds(hostEl);
        try {
          await KuiperStore.patchSprint(sprint.id, { project_ids });
          sprint.project_ids = project_ids;
          await reloadBoard();
        } catch (err) {
          ctx.toast?.(err.message, null, 8000, 'error');
          cb.checked = !cb.checked;
        }
      };
    });
  }

  function wireSprintDraftRow(body, sprints, org) {
    const block = body.querySelector('.kuiper-ws-sprint-draft');
    if (!block) return;
    const row = block.querySelector('.kuiper-ws-sprint-row');
    wireWsDateTrigger(row, {
      hiddenSel: '.kuiper-ws-sprint-draft-start-val',
      btnSel: '.kuiper-ws-sprint-draft-start-btn',
    });
    wireWsDateTrigger(row, {
      hiddenSel: '.kuiper-ws-sprint-draft-end-val',
      btnSel: '.kuiper-ws-sprint-draft-end-btn',
    });
    const nameInp = block.querySelector('.kuiper-ws-sprint-draft-name');
    const submitDraft = async () => {
      const name = nameInp?.value.trim();
      const start = row.querySelector('.kuiper-ws-sprint-draft-start-val')?.value?.trim();
      const end = row.querySelector('.kuiper-ws-sprint-draft-end-val')?.value?.trim();
      if (!name || !start || !end) {
        ctx.toast?.(tr('workspaceAdminSprintInvalid'), null, undefined, 'warning');
        return;
      }
      const check = BoardCore.validateSchedule(start, end);
      if (!check.ok) {
        ctx.toast?.(tr('scheduleInvalidRange'), null, undefined, 'warning');
        return;
      }
      try {
        const created = await KuiperStore.createOrgSprint(org, {
          name, start_date: start, end_date: end, project_ids: [],
        });
        sprintComposeActive = false;
        selectedSprintId = created?.id || null;
        sprintDetailExpanded = true;
        await reloadBoard();
        await renderBody();
      } catch (err) {
        ctx.toast?.(err.message, null, 8000, 'error');
      }
    };
    bindSubmitOnEnter(nameInp, submitDraft);
    block.querySelector('[data-act="cancel-sprint-draft"]')?.addEventListener('click', e => {
      e.stopPropagation();
      sprintComposeActive = false;
      renderBody();
    });
    nameInp?.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        e.preventDefault();
        sprintComposeActive = false;
        renderBody();
      }
    });
    requestAnimationFrame(() => {
      nameInp?.focus();
      nameInp?.select();
    });
  }

  async function renderSprintsTab(body) {
    managedOrgSlug = orgSlug();
    ensureWsDatePicker();
    const org = managedOrgSlug;
    const sprints = await KuiperStore.listOrgSprints(org, { includeArchived: showArchivedSprints }).catch(() => []);
    if (sprintComposeActive) {
      selectedSprintId = null;
      sprintDetailExpanded = false;
    } else if (!selectedSprintId || !sprints.some(s => s.id === selectedSprintId)) {
      selectedSprintId = sprints[0]?.id || null;
    }
    const defaultName = BoardCore.nextDefaultSprintName(sprints);
    const { start_date: defStart, end_date: defEnd } = BoardCore.suggestNextSprintDates(sprints);
    const sortedSprints = BoardCore.sortSprintsForAdmin(sprints, sprintListSort);
    body.classList.add('kuiper-ws-boards-tab', 'kuiper-ws-sprints-tab');
    body.innerHTML = `
      <section class="kuiper-ws-section kuiper-ws-section--compact">
        <div class="kuiper-ws-row kuiper-ws-section-head kuiper-ws-sprint-list-head">
          <div class="menu-label">${esc(tr('workspaceAdminSprintList'))}</div>
          ${sprintSortSelectHtml()}
          <button type="button" class="icon sm kuiper-ws-sprint-compose" data-act="compose-sprint" title="${esc(tr('workspaceAdminNewSprint'))}" aria-label="${esc(tr('workspaceAdminNewSprint'))}">+</button>
          ${archivedToggleHtml('kuiperWsShowArchivedSprints', showArchivedSprints)}
        </div>
        <ul class="kuiper-ws-list kuiper-ws-board-list" id="kuiperWsSprintList">
          ${sprintComposeActive ? sprintDraftRowHtml(defaultName, defStart, defEnd) : ''}${sortedSprints.map(s => sprintRowHtml(s, selectedSprintId)).join('')}
        </ul>
      </section>`;

    wireArchivedToggle(body, 'kuiperWsShowArchivedSprints', checked => { showArchivedSprints = checked; });
    wireSprintSortDropdown();
    body.querySelector('[data-act="compose-sprint"]')?.addEventListener('click', () => {
      if (sprintComposeActive) return;
      sprintComposeActive = true;
      selectedSprintId = null;
      sprintDetailExpanded = false;
      renderBody();
    });
    wireSprintRows(body, sprints);
    wireSprintDraftRow(body, sprints, org);
    await refreshSprintDetailPanels(body, sprints);
  }

  async function renderBody() {
    const body = bodyEl();
    if (!body) return;
    tabButtons();
    const title = pageRoot()?.querySelector('#kuiperWsAdminTitle');
    if (title) title.textContent = tr('workspaceManage');
    body.innerHTML = `<p class="kuiper-hint">${esc(tr('loading'))}…</p>`;
    try {
      if (tab === 'organizations') await renderOrganizationsTab(body);
      else if (tab === 'boards') await renderBoardsTab(body);
      else if (tab === 'projects') await renderProjectsTab(body);
      else if (tab === 'sprints') await renderSprintsTab(body);
    } catch (err) {
      body.innerHTML = `<p class="kuiper-cal-empty">${esc(err.message)}</p>`;
    }
  }

  function render(boardEl) {
    if (!orgSlug()) {
      boardEl.className = 'board kuiper-ws-board';
      boardEl.innerHTML = `<p class="kuiper-view-missing-msg">${esc(tr('workspaceAdminNeedsOrg'))}</p>`;
      return;
    }
    host = boardEl;
    if (pendingTab) {
      tab = pendingTab;
      pendingTab = null;
    } else {
      const saved = readPersistedAdminTab();
      if (saved) tab = saved;
    }
    boardEl.className = 'board kuiper-ws-board';
    ensureShell();
    renderBody();
  }

  function open(nextTab) {
    if (typeof KuiperUI !== 'undefined' && KuiperUI.enterWorkspace) {
      KuiperUI.enterWorkspace(nextTab);
      return;
    }
    if (!orgSlug()) {
      ctx.toast?.(tr('workspaceAdminNeedsOrg'), null, undefined, 'warning');
      return;
    }
    prepare(nextTab);
    ctx.renderBoard?.();
  }

  function close() {
    if (typeof KuiperUI !== 'undefined' && KuiperUI.exitWorkspace) {
      KuiperUI.exitWorkspace();
    }
  }

  function init(hooks) {
    ctx = hooks || {};
  }

  /** Tablero principal reordenó etapas (misma fuente: API). Refresca lista en pestaña Boards si aplica. */
  async function onBoardStagesChanged(slug) {
    const s = slug || boardSlug();
    if (!s || s !== selectedBoardSlug) return;
    if (tab === 'boards') await refreshBoardsPanels();
  }

  return {
    init,
    open,
    close,
    render,
    prepare,
    setTab,
    reloadBoard,
    syncAfterBoardLoad,
    onBoardStagesChanged,
    onActiveOrgChanged,
  };
})();

if (typeof window !== 'undefined') window.KuiperWorkspaceAdmin = KuiperWorkspaceAdmin;
if (typeof module !== 'undefined') module.exports = { KuiperWorkspaceAdmin };
