import { invoke, getCurrentWindow, checkUpdate, openUrl, ask } from './js/api.js';
import { $, showToast, setStatus, showModal, closeModal } from './js/utils.js';
import { state } from './js/state.js';
import { loadConfig, saveConfig, loadCustomThemes } from './js/config.js';
import { setupModsEvents, refreshMods } from './js/mods.js';
import { setupSongsEvents, refreshSongs } from './js/songs.js';
import { setupSavesEvents, refreshSaves, refreshBackups } from './js/saves.js';
import { setupConfigEvents } from './js/settings.js';
import { setupDownloaderEvents, autoFetchCatalogue } from './js/downloader.js';
import { setupNexusEvents } from './js/nexus.js';

async function init() {
  await setupWindowControls();
  await loadConfig();

  try {
    const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const branch = isDev ? 'Development' : 'Stable';

    if (window.__TAURI__?.app) {
      const version = await window.__TAURI__.app.getVersion();
      const el = $('title-bar-text');
      if (el) el.innerText = `DISCOMOD // ${branch} v${version}`;
    } else {
      const el = $('title-bar-text');
      if (el) el.innerText = `DISCOMOD // ${branch} vDev`;
    }
  } catch (e) {
    console.error("Failed to load version info:", e);
    const el = $('title-bar-text');
    if (el) el.innerText = `DISCOMOD // Error vUnknown`;
  }

  setupNavigation();
  setupModsEvents();
  setupSongsEvents();
  setupSavesEvents();
  setupDownloaderEvents();
  setupNexusEvents();
  setupMenuNavigation('mods');
  setupMenuNavigation('songs');
  setupMenuNavigation('saves');
  setupModals();
  setupExternalLinks();
  setupUtilityEvents();
  setupCustomSelects();
  setupConfigEvents();
  refreshUE4SSStatus();

  try {
    await refreshMods();
  } catch (e) {
    console.error('Failed to refresh mods:', e);
  }

  try {
    await refreshSongs();
  } catch (e) {
    console.error('Failed to refresh songs:', e);
  }

  try {
    await refreshSaves();
    await refreshBackups();
  } catch (e) {
    console.error('Failed to refresh saves:', e);
  }

  checkUpdates(true);
  loadCustomThemes();
  startAutoRefresh();
}

let refreshInterval = null;
function startAutoRefresh() {
  if (refreshInterval) clearInterval(refreshInterval);
  refreshInterval = setInterval(async () => {

    if (document.hasFocus()) {
      await refreshMods(true);
      await refreshSongs(true);
      await refreshSaves(true);
      await refreshBackups(true);
      await loadCustomThemes(true);
    }
  }, 10000);
}

document.addEventListener('DOMContentLoaded', init);

async function setupWindowControls() {
  const appWindow = getCurrentWindow();

  const setupBtn = (id, action) => {
    const el = $(id);
    if (el) el.addEventListener('click', action);
  };

  setupBtn('btn-minimize', () => appWindow.minimize());
  setupBtn('btn-maximize', () => appWindow.toggleMaximize());
  setupBtn('btn-close', () => appWindow.close());
}

function switchPage(pageId, push = true) {
  if (!pageId) return;
  const pages = document.querySelectorAll('.page');
  const navBtns = document.querySelectorAll('.nav-btn');

  const currentState = history.state;
  if (push && currentState && currentState.pageId === pageId && currentState.viewId === 'menu') {
    return;
  }

  pages.forEach(p => p.classList.toggle('active', p.id === `page-${pageId}`));
  navBtns.forEach(n => n.classList.toggle('active', n.dataset.page === pageId));

  switchSubView(pageId, 'menu', false);

  if (push) {
    history.pushState({ pageId, viewId: 'menu' }, '', `#${pageId}`);
  }
}

function switchSubView(pageId, viewId, push = true) {
  if (!pageId || !viewId) return;

  const currentState = history.state;
  if (push && currentState && currentState.pageId === pageId && currentState.viewId === viewId) {
    return;
  }

  const views = document.querySelectorAll(`#page-${pageId} .page-view`);
  const breadcrumb = $(`${pageId}-breadcrumb`);
  const title = $(`${pageId}-title`);
  const stats = $(`${pageId}-stats`);
  const currentBreadcrumb = $(`${pageId}-breadcrumb-current`);

  if (views.length > 0) {
    views.forEach(v => {
      const targetId = `${pageId}-view-${viewId}`;
      v.classList.toggle('active', v.id === targetId);
    });
  }

  if (viewId === 'menu') {
    if (breadcrumb) breadcrumb.style.display = 'none';
    if (title) {
      title.style.display = 'block';
      const mainTitles = { 'mods': 'Mod Manager', 'songs': 'Song Manager', 'saves': 'Game Saves' };
      title.innerText = mainTitles[pageId] || 'Manager';
    }
    if (stats) stats.style.display = 'block';
  } else {
    if (breadcrumb) breadcrumb.style.display = 'flex';
    if (currentBreadcrumb) {
      const viewNames = {
        'list': pageId === 'mods' ? 'Available Mods' : 'Custom Songs',
        'nexus': 'Browse Nexus',
        'importers': 'Import & Export',
        'downloader': 'Song Downloader',
        'backups': 'Backups & Recovery',
        'editor': 'Save Editor'
      };
      const viewName = viewNames[viewId] || (viewId.charAt(0).toUpperCase() + viewId.slice(1));
      currentBreadcrumb.innerText = viewName;
      if (title) title.innerText = viewName;
    }

    if (stats) stats.style.display = (viewId === 'list' || viewId === 'backups') ? 'block' : 'none';
    if (viewId === 'downloader') autoFetchCatalogue();
  }

  if (pageId === 'songs') {
    const attr = $('songs-attribution');
    if (attr) attr.style.display = (viewId === 'downloader') ? 'block' : 'none';
  } else if (pageId === 'mods') {
    const attr = $('nexus-attribution');
    if (attr) attr.style.display = (viewId === 'nexus') ? 'block' : 'none';
  }

  if (push) {
    history.pushState({ pageId, viewId }, '', `#${pageId}/${viewId}`);
  }
}

function setupMenuNavigation(pageId) {
  const container = $(`${pageId}-content`);
  if (!container) return;

  container.querySelectorAll('.menu-card[data-view]').forEach(card => {
    card.addEventListener('click', () => {
      switchSubView(pageId, card.dataset.view);
    });
  });

  const breadcrumb = $(`${pageId}-breadcrumb`);
  if (breadcrumb) {
    breadcrumb.querySelectorAll('.breadcrumb-item[data-view]').forEach(item => {
      item.addEventListener('click', () => {
        switchSubView(pageId, item.dataset.view);
      });
    });
  }
}

function setupNavigation() {
  const navBtns = document.querySelectorAll('.nav-btn');
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      switchPage(btn.dataset.page);
    });
  });

  window.addEventListener('popstate', (e) => {
    if (e.state && e.state.pageId) {
      const pages = document.querySelectorAll('.page');
      const navBtns = document.querySelectorAll('.nav-btn');
      pages.forEach(p => p.classList.toggle('active', p.id === `page-${e.state.pageId}`));
      navBtns.forEach(n => n.classList.toggle('active', n.dataset.page === e.state.pageId));

      switchSubView(e.state.pageId, e.state.viewId || 'menu', false);
    }
  });

  window.addEventListener('mouseup', (e) => {
    if (e.button === 3) history.back();
    if (e.button === 4) history.forward();
  });
  $('btn-nav-back')?.addEventListener('click', () => history.back());
  $('btn-nav-forward')?.addEventListener('click', () => history.forward());

  const parts = window.location.hash.slice(1).split('/');
  const pageId = parts[0] || 'mods';
  const viewId = parts[1] || 'menu';
  
  switchPage(pageId, false);
  if (viewId !== 'menu') {
    switchSubView(pageId, viewId, false);
  }
  history.replaceState({ pageId, viewId }, '', window.location.hash || `#${pageId}`);
}

function setupExternalLinks() {
  document.addEventListener('click', (e) => {
    const target = e.target.closest('[data-external-url]');
    if (target) {
      e.preventDefault();
      const url = target.getAttribute('data-external-url');
      if (url) openUrl(url);
    }
  });
}

function setupModals() {
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) {
        closeModal(overlay.id);
      }
    });
  });

  $('modal-install-cancel').addEventListener('click', () => closeModal('modal-install-mod'));
  $('modal-install-confirm').addEventListener('click', async () => {
    const archivePath = $('install-name-input').dataset.archivePath;
    const modName = $('install-name-input').value;
    const modType = $('install-type-select').value;

    if (!archivePath || !modName) return;

    closeModal('modal-install-mod');
    showModal('modal-loading');

    try {
      await invoke('install_mod', { archivePath, modName, modType });
      closeModal('modal-loading');
      showToast(`Installed mod ${modName}`, 'success');
      refreshMods();
    } catch (err) {
      closeModal('modal-loading');
      showToast(`Failed to install: ${err}`, 'error');
    }
  });

  $('modal-rename-cancel').addEventListener('click', () => closeModal('modal-rename'));
  $('modal-rename-confirm').addEventListener('click', async () => {
    const newName = $('rename-input').value;
    const oldName = $('rename-input').dataset.oldName;
    if (!newName || newName === oldName) return closeModal('modal-rename');

    try {
      const ok = await invoke('rename_mod', { oldName, newName });
      if (ok) {
        showToast(`Renamed to ${newName}`, 'success');
        refreshMods();
      } else {
        showToast("Rename failed", 'error');
      }
    } catch (err) {
      showToast(`Error: ${err}`, 'error');
    }
    closeModal('modal-rename');
  });

  $('modal-song-meta-cancel').addEventListener('click', () => closeModal('modal-song-meta'));
  $('modal-song-meta-confirm').addEventListener('click', async () => {
    const path = $('modal-song-meta-confirm').dataset.path;
    const metadata = {
      songName: $('meta-song-name').value,
      performedBy: [$('meta-artist').value],
      tempo: parseFloat($('meta-tempo').value),
      beatOffset: parseInt($('meta-beat-offset').value),
      startSongOffset: parseFloat($('meta-start-offset').value),
      endSongOffset: parseFloat($('meta-end-offset').value),
    };

    try {
      await invoke('update_song_metadata', { folderPath: path, metadata });
      showToast("Metadata updated", 'success');
      refreshSongs();
    } catch (err) {
      showToast(`Update failed: ${err}`, 'error');
    }
    closeModal('modal-song-meta');
  });

  $('import-method-cancel').addEventListener('click', () => closeModal('modal-import-method'));

  $('import-select-all')?.addEventListener('change', (e) => {
    document.querySelectorAll('#import-selection-list .selection-item-check').forEach(cb => {
      cb.checked = e.target.checked;
    });
  });
}

function setupUtilityEvents() {
  $('btn-open-game-dir')?.addEventListener('click', async () => {
    if (!state.config.exePath) return showToast("Game path not set! Go to Settings.", 'error');
    try {
      await invoke('open_game_root', { exePath: state.config.exePath });
    } catch (err) {
      showToast(`Failed to open folder: ${err}`, 'error');
    }
  });

  $('btn-open-active-mods-dir')?.addEventListener('click', async () => {
    if (!state.config.exePath) return showToast("Game path not set! Go to Settings.", 'error');
    try {
      await invoke('open_active_mods_folder', { exePath: state.config.exePath });
    } catch (err) {
      showToast(`Failed to open folder: ${err}`, 'error');
    }
  });

  $('btn-open-logic-mods-dir')?.addEventListener('click', async () => {
    if (!state.config.exePath) return showToast("Game path not set! Go to Settings.", 'error');
    try {
      await invoke('open_logic_mods_folder', { exePath: state.config.exePath });
    } catch (err) {
      showToast(`Failed to open folder: ${err}`, 'error');
    }
  });

  $('btn-open-storage-dir')?.addEventListener('click', async () => {
    if (!state.config.modsStoragePath) return showToast("Storage path not set! Go to Settings.", 'error');
    try {
      await invoke('open_folder', { path: state.config.modsStoragePath });
    } catch (err) {
      showToast(`Failed to open folder: ${err}`, 'error');
    }
  });

  $('btn-open-config-dir')?.addEventListener('click', () => invoke('open_config_dir'));
  $('btn-open-themes-dir')?.addEventListener('click', () => invoke('open_themes_dir'));
  $('btn-open-saves-dir')?.addEventListener('click', () => invoke('open_saves_backup_dir'));

  $('btn-install-ue4ss-card')?.addEventListener('click', async () => {
    try {
      showToast("Downloading and installing UE4SS...", 'info');
      const msg = await invoke('install_ue4ss', { exePath: state.config.exePath });
      showToast(msg, 'success');
      refreshUE4SSStatus();
    } catch (err) {
      showToast(`Installation failed: ${err}`, 'error');
    }
  });

  $('btn-uninstall-ue4ss-card')?.addEventListener('click', async () => {
    try {
      const msg = await invoke('uninstall_ue4ss', { exePath: state.config.exePath });
      showToast(msg, 'success');
      refreshUE4SSStatus();
    } catch (err) {
      showToast(`Uninstallation failed: ${err}`, 'error');
    }
  });

  $('btn-launch')?.addEventListener('click', async () => {
    try {
      await invoke('launch_game');
    } catch (err) {
      showToast(`Launch error: ${err}`, 'error');
    }
  });
}

function setupCustomSelects() {
  const customSelect = $('theme-custom-select');
  const trigger = $('theme-trigger');
  const label = $('theme-current-label');
  const optionsPanel = $('theme-options');
  const nativeSelect = $('theme-select');

  if (!customSelect || !trigger) return;

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    customSelect.classList.toggle('open');
  });

  optionsPanel.addEventListener('click', (e) => {
    const opt = e.target.closest('.custom-option');
    if (!opt) return;

    const value = opt.dataset.value;
    const text = opt.innerText;

    label.innerText = text;
    nativeSelect.value = value;
    customSelect.classList.remove('open');

    state.config.theme = value;
    document.documentElement.setAttribute('data-theme', value);
    saveConfig();

    document.querySelectorAll('.custom-option').forEach(o => o.classList.toggle('selected', o === opt));
  });

  document.addEventListener('click', () => {
    customSelect.classList.remove('open');
  });
}

let updateManifest = null;

async function checkUpdates(silent = false) {
  const btn = $('btn-check-updates');
  if (btn && !silent) {
    btn.innerText = "Checking...";
    btn.disabled = true;
  }

  try {
    const update = await checkUpdate();
    if (update) {
      updateManifest = update;
      if (btn) {
        btn.innerText = "Update Now";
        btn.classList.add('update-ready');
        btn.disabled = false;
      }
      if (!silent) showUpdateModal();
    } else {
      if (btn && !silent) {
        btn.innerText = "Up to Date";
        setTimeout(() => {
          btn.innerText = "Check for Updates";
          btn.disabled = false;
        }, 3000);
      }
      if (!silent) showToast("You are already using the latest version.", 'info');
    }
  } catch (err) {
    console.error("Update check failed:", err);
    if (btn && !silent) {
      btn.innerText = "Check Failed";
      btn.disabled = false;
      setTimeout(() => {
        btn.innerText = "Check for Updates";
      }, 3000);
    }
    if (!silent) showToast(`Update check failed: ${err}`, 'error');
  }
}

function showUpdateModal() {
  if (!updateManifest) return;

  $('modal-update-msg').innerText = `A new version (${updateManifest.version}) is available.`;
  $('modal-update-changelog').innerText = updateManifest.body || "No changelog provided.";

  $('modal-update-now').onclick = async () => {
    try {
      $('modal-update-now').disabled = true;
      $('modal-update-now').innerText = "Downloading...";

      await updateManifest.downloadAndInstall((event) => {

      });

      showToast("Update installed! Restarting...", 'success');
    } catch (err) {
      console.error("Update failed:", err);
      showToast(`Update failed: ${err}`, 'error');
      $('modal-update-now').disabled = false;
      $('modal-update-now').innerText = "Try Again";
    }
  };

  $('modal-update-later').onclick = () => closeModal('modal-update');
  showModal('modal-update');
}

$('btn-check-updates')?.addEventListener('click', () => {
  if (updateManifest) {
    showUpdateModal();
  } else {
    checkUpdates(false);
  }
});

async function refreshUE4SSStatus() {
  const path = state.config.exePath || state.config.exe_path;
  if (!path) return;

  try {
    const installed = await invoke('is_ue4ss_installed', { exePath: path });
    const installCard = $('btn-install-ue4ss-card');
    const uninstallCard = $('btn-uninstall-ue4ss-card');

    if (installCard) installCard.style.display = installed ? 'none' : 'flex';
    if (uninstallCard) uninstallCard.style.display = installed ? 'flex' : 'none';
  } catch (e) {
    console.error("Failed to check UE4SS status:", e);
  }
}
