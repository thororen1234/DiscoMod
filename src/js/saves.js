import { invoke, ask } from './api.js';
import { $, formatDate, showToast, showModal, closeModal } from './utils.js';
import { state } from './state.js';

export async function refreshSaves(silent = false) {
  try {
    const newSaves = await invoke('list_game_saves');
    if (silent && JSON.stringify(newSaves) === JSON.stringify(state.availableSaves)) return;

    state.availableSaves = newSaves;
    renderSaves();
  } catch (err) {
    console.error("Failed to refresh saves:", err);
  }
}

export async function refreshBackups(silent = false) {
  try {
    const newBackups = await invoke('list_backups');
    if (silent && JSON.stringify(newBackups) === JSON.stringify(state.availableBackups)) return;

    state.availableBackups = newBackups;
    renderBackups();
  } catch (err) {
    console.error("Failed to refresh backups:", err);
  }
}

export function renderSaves() {
  const container = $('game-saves-list');
  const editorContainer = $('editor-saves-list');
  if (!container && !editorContainer) return;

  if (container) container.innerHTML = '';
  if (editorContainer) editorContainer.innerHTML = '';

  const stats = $('saves-stats');
  if (stats) stats.innerText = `${state.availableSaves.length} saves`;

  if (state.availableSaves.length === 0) {
    if (container) container.innerHTML = '<div class="dl-placeholder">No game saves found.</div>';
    if (editorContainer) editorContainer.innerHTML = '<div class="dl-placeholder">No game saves found.</div>';
    return;
  }

  state.availableSaves.forEach(save => {
    const cardHtml = `
      <div class="save-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
      </div>
      <div class="save-info">
        <div class="save-filename">${save.name}</div>
        <div class="save-date">${formatDate(save.lastModified)}</div>
      </div>
      <div class="save-card-actions">
        <button class="save-btn btn-edit-save" data-path="${save.path}" title="Edit Save Data">Edit</button>
        <button class="save-btn btn-backup-save" data-path="${save.path}">Backup</button>
      </div>
    `;

    if (container) {
      const card = document.createElement('div');
      card.className = 'save-card';
      card.innerHTML = cardHtml;
      container.appendChild(card);
    }
    if (editorContainer) {
      const card = document.createElement('div');
      card.className = 'save-card';
      card.innerHTML = cardHtml;
      editorContainer.appendChild(card);
    }
  });

  document.querySelectorAll('.btn-edit-save').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const path = e.target.dataset.path;
      state.editingSavePath = path;
      await openSaveEditor(path);
    });
  });

  document.querySelectorAll('.btn-backup-save').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const path = e.target.dataset.path;
      try {
        await invoke('backup_save', { path });
        showToast("Backup created", 'success');
        refreshBackups();
      } catch (err) {
        showToast(`Backup failed: ${err}`, 'error');
      }
    });
  });
}

export function renderBackups() {
  const container = $('backups-list');
  if (!container) return;
  container.innerHTML = '';

  if (state.availableBackups.length === 0) {
    container.innerHTML = '<div class="dl-placeholder">No backups found.</div>';
    return;
  }

  state.availableBackups.forEach(backup => {
    const card = document.createElement('div');
    card.className = 'save-card';
    card.innerHTML = `
      <div class="save-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
      </div>
      <div class="save-info">
        <div class="save-filename">${backup.originalName}</div>
        <div class="save-date">${backup.date}</div>
      </div>
      <div class="save-card-actions">
        <button class="save-btn accent btn-restore-backup" data-path="${backup.path}">Restore</button>
        <button class="save-btn danger btn-delete-backup" data-path="${backup.path}">Delete</button>
      </div>
    `;
    container.appendChild(card);
  });

  document.querySelectorAll('.btn-restore-backup').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const path = e.target.dataset.path;
      const yes = await ask("Restoring this backup will overwrite your current save. Continue?", { title: "Restore Backup", kind: "warning" });
      if (yes) {
        try {
          await invoke('restore_save', { backupPath: path });
          showToast("Backup restored", 'success');
          refreshSaves();
        } catch (err) {
          showToast(`Restore failed: ${err}`, 'error');
        }
      }
    });
  });

  document.querySelectorAll('.btn-delete-backup').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const path = e.target.dataset.path;
      const yes = await ask("Permanently delete this backup?", { title: "Delete Backup", kind: "warning" });
      if (yes) {
        try {
          await invoke('delete_backup', { path });
          showToast("Backup deleted", 'success');
          refreshBackups();
        } catch (err) {
          showToast(`Delete failed: ${err}`, 'error');
        }
      }
    });
  });
}

export function setupSavesEvents() {
  $('btn-refresh-saves')?.addEventListener('click', async () => {
    await refreshSaves();
    await refreshBackups();
    showToast("Saves refreshed", 'success');
  });

  $('btn-export-saves')?.addEventListener('click', async () => {
    if (state.availableSaves.length === 0) return showToast("No saves to export.", 'info');

    const savePath = await window.__TAURI__.dialog.save({
      filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
      defaultPath: "My_Dead_As_Disco_Saves.zip"
    });

    if (savePath) {
      try {
        showModal('modal-loading');
        const savePaths = state.availableSaves.map(s => s.path);
        await invoke('export_saves', { savePaths, outputPath: savePath });
        closeModal('modal-loading');
        showToast("Saves exported successfully!", 'success');
      } catch (err) {
        closeModal('modal-loading');
        showToast(`Export failed: ${err}`, 'error');
      }
    }
  });

  const handleImport = async (paths) => {
    if (!paths || paths.length === 0) return;
    try {
      showModal('modal-loading');
      for (const path of paths) {
        await invoke('import_save', { path });
      }
      closeModal('modal-loading');
      showToast(`Imported ${paths.length} save(s) and backed up current progress`, 'success');
      refreshSaves();
      refreshBackups();
    } catch (err) {
      closeModal('modal-loading');
      showToast(`Import error: ${err}`, 'error');
    }
  };

  $('btn-import-save-card')?.addEventListener('click', async () => {
    const files = await window.__TAURI__.dialog.open({
      multiple: true,
      filters: [{ name: 'Save File', extensions: ['sav'] }]
    });
    if (files) await handleImport(Array.isArray(files) ? files : [files]);
  });


  $('modal-save-editor-cancel')?.addEventListener('click', () => closeModal('modal-save-editor'));
  $('modal-save-editor-confirm')?.addEventListener('click', async () => {
    const updates = {};
    let hasError = false;

    document.querySelectorAll('.save-editor-input').forEach(input => {
      const key = input.dataset.key;
      const type = input.dataset.type;
      let val;

      try {
        if (type === 'Bool') {
          val = input.checked;
        } else if (['Int', 'Int64', 'UInt32', 'Float', 'Double'].includes(type)) {
          val = parseFloat(input.value);
        } else if (type === 'Str' || type === 'Name') {
          val = input.value;
        } else {

          val = JSON.parse(input.value);
        }


        updates[key] = { [type]: val };
      } catch (e) {
        console.error(`Error parsing property ${key}:`, e);
        showToast(`Invalid format for ${key}`, 'error');
        hasError = true;
      }
    });

    if (hasError) return;

    try {
      showModal('modal-loading');
      await invoke('write_save_data', { path: state.editingSavePath, updates });
      closeModal('modal-loading');
      closeModal('modal-save-editor');
      showToast("Save file updated successfully", 'success');
      refreshSaves();
    } catch (err) {
      closeModal('modal-loading');
      showToast(`Save error: ${err}`, 'error');
    }
  });

  $('save-editor-search')?.addEventListener('input', () => {
    renderSaveProperties(state.currentSaveData);
  });
}

async function openSaveEditor(path) {
  try {
    showModal('modal-loading');
    const data = await invoke('read_save_data', { path });
    state.currentSaveData = data;
    closeModal('modal-loading');
    renderSaveProperties(data);
    showModal('modal-save-editor');
  } catch (err) {
    closeModal('modal-loading');
    showToast(`Failed to load save: ${err}`, 'error');
  }
}

function renderSaveProperties(data) {
  const container = $('save-editor-list');
  const searchTerm = ($('save-editor-search')?.value || '').toLowerCase();
  if (!container) return;
  container.innerHTML = '';

  const entries = Object.entries(data);
  const filtered = entries.filter(([key, val]) => {
    const keyStr = key.toLowerCase();
    const valStr = JSON.stringify(val).toLowerCase();
    return keyStr.includes(searchTerm) || valStr.includes(searchTerm);
  });

  if (filtered.length === 0) {
    container.innerHTML = '<div class="dl-placeholder">No matching properties found.</div>';
    return;
  }

  filtered.forEach(([key, val]) => {

    const type = Object.keys(val)[0];
    const actualValue = val[type];

    const item = document.createElement('div');
    item.className = 'dl-item';
    item.style.padding = '12px';
    item.style.flexDirection = 'column';
    item.style.alignItems = 'stretch';
    item.style.gap = '8px';

    let inputHtml;
    const isComplex = ['Struct', 'Array', 'Map', 'Set', 'Raw', 'Text'].includes(type);

    if (type === 'Bool') {
      inputHtml = `
        <label class="toggle">
          <input type="checkbox" class="save-editor-input" data-key="${key}" data-type="Bool" ${actualValue ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>`;
    } else if (type === 'Int' || type === 'Int64' || type === 'UInt32' || type === 'Float' || type === 'Double') {
      inputHtml = `<input type="number" class="form-input save-editor-input" data-key="${key}" data-type="${type}" value="${actualValue}" style="width:100%; height:32px;">`;
    } else if (type === 'Str' || type === 'Name') {
      inputHtml = `<input type="text" class="form-input save-editor-input" data-key="${key}" data-type="${type}" value="${actualValue}" style="width:100%; height:32px;">`;
    } else {

      const jsonStr = JSON.stringify(actualValue, null, 2);
      inputHtml = `<textarea class="form-input save-editor-input" data-key="${key}" data-type="${type}" style="width:100%; height:120px; font-family:monospace; font-size:11px; padding:8px;">${jsonStr}</textarea>`;
    }

    item.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <div style="flex:1; min-width: 0;">
          <div style="font-size:12px; font-weight:700; color:var(--text-main); overflow:hidden; text-overflow:ellipsis;">${key}</div>
          <div style="font-size:10px; color:var(--accent); font-weight: 500;">${type}</div>
        </div>
      </div>
      <div style="width: 100%;">
        ${inputHtml}
      </div>
    `;
    container.appendChild(item);
  });
}
