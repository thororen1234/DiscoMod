import { invoke, openDialog, ask, checkUpdate } from './api.js';
import { $, showToast, showModal, closeModal } from './utils.js';
import { refreshMods } from './mods.js';
import { refreshSongs } from './songs.js';
import { refreshSaves, refreshBackups } from './saves.js';
import { saveConfig } from './config.js';
import { state } from './state.js';

export function setupConfigEvents() {
  $('exe-browse-btn').addEventListener('click', async () => {
    const file = await openDialog({
      multiple: false,
      filters: [{ name: 'Pagoda Executable', extensions: ['exe'] }]
    });
    if (file) {
      try {
        const res = await invoke('set_exe_path', { path: file });
        $('exe-input').value = file;
        state.config = res.config;
      } catch (err) {
        showToast(`Failed to set EXE: ${err}`, 'error');
      }
    }
  });

  $('storage-browse-btn').addEventListener('click', async () => {
    const folder = await openDialog({ directory: true });
    if (folder) {
      try {
        const res = await invoke('set_storage_path', { path: folder, force: false });
        if (!res.success) {
          const yes = await ask("Error! The storage folder MUST be outside the game directory." + "\n\nForce use this folder anyway?", { title: "Warning", kind: "warning" });
          if (yes) {
            const forceRes = await invoke('set_storage_path', { path: folder, force: true });
            $('storage-input').value = folder;
            state.config = forceRes.config;
            refreshMods();
          }
        } else {
          $('storage-input').value = folder;
          state.config = res.config;
          refreshMods();
        }
      } catch (err) {
        showToast(`Failed to set storage: ${err}`, 'error');
      }
    }
  });

  $('dl-save-key-btn').addEventListener('click', () => {
    state.config.discomapsApiKey = $('dl-api-key-input').value;
    saveConfig();
    showToast("API Key saved", 'success');
  });

  $('btn-toggle-api-key').addEventListener('click', () => {
    const input = $('dl-api-key-input');
    const btn = $('btn-toggle-api-key');
    if (input.type === 'password') {
      input.type = 'text';
      btn.innerText = 'Hide';
    } else {
      input.type = 'password';
      btn.innerText = 'Show';
    }
  });

  $('theme-select').addEventListener('change', (e) => {
    const theme = e.target.value;
    document.documentElement.setAttribute('data-theme', theme);
    state.config.theme = theme;
    saveConfig();
  });

  $('nexus-save-key-btn').addEventListener('click', () => {
    state.config.nexusApiKey = $('nexus-api-key-input').value;
    saveConfig();
    showToast("Nexus API Key saved", 'success');
  });

  $('btn-toggle-nexus-key').addEventListener('click', () => {
    const input = $('nexus-api-key-input');
    const btn = $('btn-toggle-nexus-key');
    if (input.type === 'password') {
      input.type = 'text';
      btn.innerText = 'Hide';
    } else {
      input.type = 'password';
      btn.innerText = 'Show';
    }
  });
}
