/* Diálogos de confirmación (archivar / eliminar con palabra clave) */
const KuiperConfirm = (() => {
  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  function removeModal() {
    document.getElementById('kuiperConfirmScrim')?.remove();
  }

  function confirmArchive({ title, message, confirmLabel, cancelLabel }) {
    return new Promise(resolve => {
      removeModal();
      const scrim = document.createElement('div');
      scrim.id = 'kuiperConfirmScrim';
      scrim.className = 'kuiper-confirm-scrim';
      scrim.innerHTML = `
        <div class="kuiper-confirm-card" role="dialog" aria-modal="true">
          <h3 class="kuiper-confirm-title">${esc(title)}</h3>
          <p class="kuiper-confirm-msg">${esc(message)}</p>
          <div class="kuiper-confirm-actions">
            <button type="button" class="kuiper-confirm-btn ghost" data-act="cancel">${esc(cancelLabel)}</button>
            <button type="button" class="kuiper-confirm-btn danger" data-act="ok">${esc(confirmLabel)}</button>
          </div>
        </div>`;
      document.body.append(scrim);
      const card = scrim.querySelector('.kuiper-confirm-card');
      card?.addEventListener('click', e => e.stopPropagation());
      const close = v => { removeModal(); resolve(v); };
      scrim.querySelector('[data-act="cancel"]').onclick = () => close(false);
      scrim.querySelector('[data-act="ok"]').onclick = () => close(true);
      scrim.addEventListener('click', e => { if (e.target === scrim) close(false); });
    });
  }

  function confirmDelete({ title, message, typeWord, placeholder, confirmLabel, cancelLabel }) {
    return new Promise(resolve => {
      removeModal();
      const scrim = document.createElement('div');
      scrim.id = 'kuiperConfirmScrim';
      scrim.className = 'kuiper-confirm-scrim';
      scrim.innerHTML = `
        <div class="kuiper-confirm-card" role="dialog" aria-modal="true">
          <h3 class="kuiper-confirm-title">${esc(title)}</h3>
          <p class="kuiper-confirm-msg">${esc(message)}</p>
          <label class="kuiper-confirm-type-label">
            <input type="text" class="kuiper-confirm-input" id="kuiperConfirmType" autocomplete="off" spellcheck="false" inputmode="text" placeholder="${esc(placeholder || typeWord)}">
          </label>
          <div class="kuiper-confirm-actions">
            <button type="button" class="kuiper-confirm-btn ghost" data-act="cancel">${esc(cancelLabel)}</button>
            <button type="button" class="kuiper-confirm-btn danger" data-act="ok" disabled>${esc(confirmLabel)}</button>
          </div>
        </div>`;
      document.body.append(scrim);
      const card = scrim.querySelector('.kuiper-confirm-card');
      card?.addEventListener('click', e => e.stopPropagation());
      const input = scrim.querySelector('#kuiperConfirmType');
      const ok = scrim.querySelector('[data-act="ok"]');
      const close = v => { removeModal(); resolve(v); };
      const check = () => {
        const match = input.value.trim().toLowerCase() === typeWord.toLowerCase();
        ok.disabled = !match;
      };
      input.oninput = check;
      input.onkeydown = e => { if (e.key === 'Enter' && !ok.disabled) close(true); };
      scrim.querySelector('[data-act="cancel"]').onclick = () => close(false);
      ok.onclick = () => { if (!ok.disabled) close(true); };
      scrim.addEventListener('click', e => { if (e.target === scrim) close(false); });
      input.focus();
    });
  }

  return { confirmArchive, confirmDelete };
})();

if (typeof window !== 'undefined') window.KuiperConfirm = KuiperConfirm;
