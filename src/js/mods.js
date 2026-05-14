import { invoke, ask, openDialog } from './api.js';
import { $, formatDate, formatSize, showToast, setStatus, showModal, closeModal, showImportSelectionModal } from './utils.js';
import { saveConfig } from './config.js';
import { state } from './state.js';

export async function refreshMods(silent = false) {
  if (!state.config.modsStoragePath) return;
  try {
    const newMods = await invoke('get_available_mods');

    if (silent && JSON.stringify(newMods) === JSON.stringify(state.availableMods)) return;

    state.availableMods = newMods;
    renderMods();
    if (!silent) setStatus('● ' + "System ready");
  } catch (err) {
    console.error(err);
  }
}

export function renderMods() {
  const container = $('mods-list');
  const emptyState = $('mods-empty');
  const searchTerm = ($('mods-search')?.value || '').toLowerCase();
  const sortBy = $('mods-sort')?.value || 'name';
  const sortOrder = $('mods-sort-order')?.classList.contains('desc') ? 'desc' : 'asc';
  const statusFilter = $('mods-status-filter')?.value || 'all';

  if (!container) return;
  container.innerHTML = '';
  const stats = $('mods-stats');
  if (stats) stats.innerText = `${state.availableMods.length} mods`;

  let filtered = state.availableMods.filter(mod => {
    const matchesSearch = mod.name.toLowerCase().includes(searchTerm) ||
      mod.folderName.toLowerCase().includes(searchTerm) ||
      (mod.type && mod.type.toLowerCase().includes(searchTerm));

    const matchesStatus = statusFilter === 'all' ||
      (statusFilter === 'enabled' && mod.enabled) ||
      (statusFilter === 'disabled' && !mod.enabled);

    return matchesSearch && matchesStatus;
  });

  filtered.sort((a, b) => {
    let res = 0;
    if (sortBy === 'date') res = (a.createdAt || 0) - (b.createdAt || 0);
    else if (sortBy === 'type') res = (a.type || '').localeCompare(b.type || '');
    else res = a.name.localeCompare(b.name);

    if (sortOrder === 'desc') return -res;
    return res;
  });

  if (filtered.length === 0) {
    emptyState.style.display = 'block';
    emptyState.innerHTML = searchTerm ? `<p>No mods matching "${searchTerm}"</p>` : `<p>No mods found. Add some to get started!</p>`;
    return;
  }

  emptyState.style.display = 'none';

  filtered.forEach((mod) => {
    const modEl = document.createElement('div');
    modEl.className = `mod-item ${mod.enabled ? 'active-mod' : ''}`;
    modEl.title = `Added: ${formatDate(mod.createdAt)}`;

    modEl.innerHTML = `
      <div class="col-select">
        <label class="checkbox-container">
          <input type="checkbox" class="mod-item-check" data-id="${mod.folderName}">
          <span class="checkmark"></span>
        </label>
      </div>
      <div class="mod-info">
        <div class="mod-name">${mod.name}</div>
        <div class="mod-meta">v${mod.version || '1.0.0'} • ${formatSize(mod.size)} • Added: ${formatDate(mod.createdAt)}</div>
      </div>
      <select class="mod-type-select" data-id="${mod.folderName}">
        <option value="character" ${mod.type === 'character' ? 'selected' : ''}>Character</option>
        <option value="map" ${mod.type === 'map' ? 'selected' : ''}>Map</option>
        <option value="logic" ${mod.type === 'logic' ? 'selected' : ''}>Logic</option>
        <option value="other" ${mod.type === 'other' ? 'selected' : ''}>Other</option>
      </select>
      <button class="icon-btn btn-rename-mod" data-id="${mod.folderName}" title="Rename Mod">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button class="icon-btn danger btn-delete-mod" data-id="${mod.folderName}" title="Delete Mod">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
      </button>
      <div class="toggle-wrap">
        <label class="toggle">
          <input type="checkbox" class="mod-toggle" data-id="${mod.folderName}" ${mod.enabled ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </div>
    `;
    container.appendChild(modEl);
  });

  attachModEvents();
  updateModsBulkUI();
}

async function syncChanges() {
  const activeNames = state.availableMods.filter(m => m.enabled).map(m => m.folderName);
  try {
    await invoke('sync_mods', { selectedMods: activeNames });
  } catch (err) {
    showToast(`Sync error: ${err}`, 'error');
  }
}

function attachModEvents() {
  document.querySelectorAll('.mod-toggle').forEach(el => {
    el.addEventListener('change', async (e) => {
      const folderName = e.target.dataset.id;
      const mod = state.availableMods.find(m => m.folderName === folderName);
      if (mod) mod.enabled = e.target.checked;
      renderMods();
      await syncChanges();
    });
  });

  document.querySelectorAll('.mod-type-select').forEach(el => {
    el.addEventListener('change', async (e) => {
      const folderName = e.target.dataset.id;
      const newType = e.target.value;
      const mod = state.availableMods.find(m => m.folderName === folderName);
      if (mod) {
        mod.type = newType;
        await invoke('update_mod_metadata', { modFolderName: folderName, key: "type", value: newType });
        await syncChanges();
      }
    });
  });

  document.querySelectorAll('.btn-rename-mod').forEach(el => {
    el.addEventListener('click', (e) => {
      const folderName = e.currentTarget.dataset.id;
      $('rename-input').value = folderName;
      $('rename-input').dataset.oldName = folderName;
      showModal('modal-rename');
    });
  });

  document.querySelectorAll('.btn-delete-mod').forEach(el => {
    el.addEventListener('click', async (e) => {
      const folderName = e.currentTarget.dataset.id;
      const yes = await ask(`Are you sure you want to permanently delete '${folderName}'?`, { title: "Confirm Deletion", kind: 'warning' });
      if (yes) {
        try {
          await invoke('delete_mod', { folderName });
          showToast(`Deleted ${folderName}`, 'success');
          await refreshMods();
          await syncChanges();
        } catch (err) {
          showToast(`Error deleting: ${err}`, 'error');
        }
      }
    });
  });

  document.querySelectorAll('.mod-item-check').forEach(el => {
    el.addEventListener('change', updateModsBulkUI);
  });
}

function updateModsBulkUI() {
  const checks = document.querySelectorAll('.mod-item-check:checked');
  const bar = $('mods-bulk-actions');
  const count = $('mods-selected-count');
  const selectAll = $('mods-select-all');

  if (checks.length > 0) {
    bar.style.display = 'flex';
    count.innerText = `${checks.length} item${checks.length === 1 ? '' : 's'} selected`;
  } else {
    bar.style.display = 'none';
  }

  const allChecks = document.querySelectorAll('.mod-item-check');
  if (selectAll) {
    selectAll.checked = allChecks.length > 0 && checks.length === allChecks.length;
  }
}

export function setupModsEvents() {
  $('mods-search')?.addEventListener('input', renderMods);
  $('mods-sort')?.addEventListener('change', () => {
    state.config.modsSort = $('mods-sort').value;
    renderMods();
    saveConfig();
  });
  $('mods-sort-order')?.addEventListener('click', () => {
    $('mods-sort-order').classList.toggle('desc');
    state.config.modsSortOrder = $('mods-sort-order').classList.contains('desc') ? 'desc' : 'asc';
    renderMods();
    saveConfig();
  });
  $('mods-status-filter')?.addEventListener('change', () => {
    state.config.modsStatusFilter = $('mods-status-filter').value;
    renderMods();
    saveConfig();
  });

  $('btn-enable-all-mods')?.addEventListener('click', async () => {
    state.availableMods.forEach(mod => mod.enabled = true);
    renderMods();
    await syncChanges();
    showToast("All mods enabled", 'success');
  });

  $('btn-disable-all-mods')?.addEventListener('click', async () => {
    state.availableMods.forEach(mod => mod.enabled = false);
    renderMods();
    await syncChanges();
    showToast("All mods disabled", 'success');
  });


  $('btn-open-active-mods-dir')?.addEventListener('click', async () => {
    try { await invoke('open_active_mods_folder', { exePath: state.config.exePath }); } catch (e) { showToast(e, 'error'); }
  });
  $('btn-open-logic-mods-dir')?.addEventListener('click', async () => {
    try { await invoke('open_logic_mods_folder', { exePath: state.config.exePath }); } catch (e) { showToast(e, 'error'); }
  });
  $('btn-open-storage-dir')?.addEventListener('click', async () => {
    try { await invoke('open_folder', { path: state.config.modsStoragePath }); } catch (e) { showToast(e, 'error'); }
  });


  $('btn-add-mod')?.addEventListener('click', async () => {
    const files = await openDialog({
      multiple: true,
      filters: [{ name: 'Mod Packages', extensions: ['zip'] }]
    });
    if (files && files.length > 0) {
      try {
        let allScannedItems = [];
        showModal('modal-loading');
        setStatus('● ' + `Scanning ${files.length} file(s)...`);

        for (const file of files) {
          const items = await invoke('scan_path_for_mods', { path: file });
          items.forEach(item => {
            item.sourceFile = file;
          });
          allScannedItems = allScannedItems.concat(items);
        }
        closeModal('modal-loading');

        if (allScannedItems.length === 0) {
          showToast("No valid mods found in selected files", 'info');
          setStatus('● ' + "System ready");
          return;
        }

        let selectedItems = allScannedItems;
        if (allScannedItems.length > 1) {
          selectedItems = await showImportSelectionModal("Select Mods to Import", allScannedItems);
          if (!selectedItems || selectedItems.length === 0) {
            setStatus('● ' + "System ready");
            return;
          }
        }

        setStatus('● ' + `Importing ${selectedItems.length} mod(s)...`);
        showModal('modal-loading');

        for (const item of selectedItems) {
          if (item.sourceFile.toLowerCase().endsWith('.zip')) {
            await invoke('import_mods_from_zip', {
              zipPath: item.sourceFile,
              internalPaths: [item.internal_path]
            });
          } else {
            await invoke('import_mod_from_folder', { path: item.internal_path });
          }
        }

        closeModal('modal-loading');
        showToast(`Imported ${selectedItems.length} mod(s)`, 'success');
        await refreshMods();
        setStatus('● ' + "System ready");
      } catch (err) {
        closeModal('modal-loading');
        showToast(`Import error: ${err}`, 'error');
        setStatus('● ' + "Sync error", true);
      }
    }
  });

  $('btn-export-mods')?.addEventListener('click', async () => {
    if (state.availableMods.length === 0) return showToast("No mods found to export", 'info');

    const items = state.availableMods.map(m => ({ name: m.name, folderName: m.folderName }));
    const selected = await showImportSelectionModal("Select Mods to Export", items, "Export Selected");

    if (!selected || selected.length === 0) {
      setStatus('● ' + "System ready");
      return;
    }

    const path = await window.__TAURI__.dialog.save({
      filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
      defaultPath: 'My_Mods_Backup.zip'
    });

    if (path) {
      try {
        showModal('modal-loading');
        const folderNames = selected.map(m => m.folderName);
        await invoke('export_mods', { names: folderNames, path });
        closeModal('modal-loading');
        showToast(`Exported ${selected.length} mod(s)`, 'success');
      } catch (err) {
        closeModal('modal-loading');
        showToast(`Export error: ${err}`, 'error');
      }
    }
  });

  $('mods-select-all')?.addEventListener('change', (e) => {
    document.querySelectorAll('.mod-item-check').forEach(cb => {
      cb.checked = e.target.checked;
    });
    updateModsBulkUI();
  });

  $('btn-bulk-enable-mods')?.addEventListener('click', async () => {
    const selected = Array.from(document.querySelectorAll('.mod-item-check:checked')).map(cb => cb.dataset.id);
    if (selected.length === 0) return;

    selected.forEach(id => {
      const mod = state.availableMods.find(m => m.folderName === id);
      if (mod) mod.enabled = true;
    });
    renderMods();
    await syncChanges();
    showToast(`Enabled ${selected.length} mods`, 'success');
  });

  $('btn-bulk-disable-mods')?.addEventListener('click', async () => {
    const selected = Array.from(document.querySelectorAll('.mod-item-check:checked')).map(cb => cb.dataset.id);
    if (selected.length === 0) return;

    selected.forEach(id => {
      const mod = state.availableMods.find(m => m.folderName === id);
      if (mod) mod.enabled = false;
    });
    renderMods();
    await syncChanges();
    showToast(`Disabled ${selected.length} mods`, 'success');
  });

  $('btn-bulk-delete-mods')?.addEventListener('click', async () => {
    const selected = Array.from(document.querySelectorAll('.mod-item-check:checked')).map(cb => cb.dataset.id);
    if (selected.length === 0) return;

    const yes = await ask(`Are you sure you want to permanently delete ${selected.length} selected mod${selected.length === 1 ? '' : 's'}?`, { title: "Confirm Bulk Deletion", kind: 'warning' });
    if (yes) {
      try {
        showModal('modal-loading');
        for (const folderName of selected) {
          await invoke('delete_mod', { folderName });
        }
        closeModal('modal-loading');
        showToast(`Deleted ${selected.length} mods`, 'success');
        await refreshMods();
        await syncChanges();
      } catch (err) {
        closeModal('modal-loading');
        showToast(`Error during bulk deletion: ${err}`, 'error');
      }
    }
  });
}
