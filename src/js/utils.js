export const $ = (id) => document.getElementById(id);

export const formatDate = (ts) => {
  if (!ts) return 'Unknown';
  return new Date(ts * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

export const formatSize = (bytes) => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

export function showToast(msg, type = 'info') {
  const container = $('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerText = msg;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 200);
  }, 3000);
}

export function setStatus(text, error = false) {
  const el = $('status-bar');
  if (!el) return;

  if (!text || text.includes("System ready")) {
    el.classList.remove('active');
    return;
  }

  el.innerText = text;
  el.classList.toggle('error', error);
  el.classList.add('active');
}

export function showModal(id) {
  const el = $(id);
  if (el) el.classList.add('open');
  else console.error(`Modal with ID ${id} not found.`);
}

export function closeModal(id) {
  const el = $(id);
  if (el) el.classList.remove('open');
}

export async function showImportSelectionModal(title, items, confirmText = "Import Selected") {
  const titleEl = $('import-selection-title');
  if (titleEl) titleEl.innerText = title;

  const confirmBtn = $('modal-import-selection-confirm');
  if (confirmBtn) confirmBtn.innerText = confirmText;

  const list = $('import-selection-list');
  if (!list) return null;
  list.innerHTML = '';

  items.forEach((item, index) => {
    const itemEl = document.createElement('div');
    itemEl.className = 'selection-item';
    itemEl.style.padding = '8px';
    itemEl.style.borderBottom = '1px solid var(--border)';
    itemEl.innerHTML = `
      <label class="checkbox-container">
        <input type="checkbox" class="selection-item-check" data-index="${index}" checked>
        <span class="checkmark"></span>
        <span class="selection-item-name" style="margin-left: 8px;">${item.name}</span>
      </label>
    `;
    list.appendChild(itemEl);
  });

  showModal('modal-import-selection');
  const selectAll = $('import-select-all');
  if (selectAll) selectAll.checked = true;

  return new Promise((resolve) => {
    const onConfirm = () => {
      const selected = [];
      document.querySelectorAll('.selection-item-check').forEach(cb => {
        if (cb.checked) selected.push(items[parseInt(cb.dataset.index)]);
      });
      cleanup();
      resolve(selected);
    };

    const onCancel = () => {
      cleanup();
      resolve(null);
    };

    const cleanup = () => {
      $('modal-import-selection-confirm').removeEventListener('click', onConfirm);
      $('modal-import-selection-cancel').removeEventListener('click', onCancel);
      closeModal('modal-import-selection');
    };

    $('modal-import-selection-confirm').addEventListener('click', onConfirm);
    $('modal-import-selection-cancel').addEventListener('click', onCancel);
  });
}
