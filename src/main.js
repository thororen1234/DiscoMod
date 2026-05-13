
const { invoke } = window.__TAURI__.core;
const { open: openDialog, message, ask, confirm } = window.__TAURI__.dialog;
const { getCurrentWindow } = window.__TAURI__.window;
let config = {};
let availableMods = [];
let availableSongs = [];

const $ = (id) => document.getElementById(id);
const formatDate = (ts) => {
  if (!ts) return 'Unknown';
  return new Date(ts * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};
const formatSize = (bytes) => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

async function init() {
  await setupWindowControls();
  await loadConfig();
  
  
  try {
    if (window.__TAURI__?.app) {
      const version = await window.__TAURI__.app.getVersion();
      const el = $('sidebar-sub');
      if (el) el.innerText = `v${version} // Stable`;
    } else {
      $('sidebar-sub').innerText = `vDev // Development`;
    }
  } catch (e) {
    console.error("Failed to load version info:", e);
    $('sidebar-sub').innerText = `vUnknown // Error`;
  }

  setupNavigation();
  setupModsEvents();
  setupSongsEvents();
  setupConfigEvents();
  setupModals();

  await refreshMods();
  await refreshSongs();

  checkUpdates(true);
}

document.addEventListener('DOMContentLoaded', init);

function showToast(msg, type = 'info') {
  const container = $('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerText = msg;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 200);
  }, 3000);
}

function setStatus(text, error = false) {
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

function showModal(id) {
  const el = $(id);
  if (el) el.classList.add('open');
  else console.error(`Modal with ID ${id} not found.`);
}

function closeModal(id) {
  const el = $(id);
  if (el) el.classList.remove('open');
}

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

async function loadConfig() {
  try {
    config = await invoke('load_config');
    $('exe-input').value = config.exePath || '';
    $('storage-input').value = config.modsStoragePath || '';
    
    if (config.discomapsApiKey) $('dl-api-key-input').value = config.discomapsApiKey;
    if (config.nexusApiKey) $('nexus-api-key-input').value = config.nexusApiKey;
    if (config.theme) {
      document.documentElement.setAttribute('data-theme', config.theme);
      $('theme-select').value = config.theme;
    }
  } catch (err) {
    console.error("Failed to load config:", err);
  }
}

async function saveConfig() {
  try {
    await invoke('save_config', { config });
  } catch (err) {
    showToast("Sync error", 'error');
  }
}

function setupNavigation() {
  const navBtns = document.querySelectorAll('.nav-btn');
  const pages = document.querySelectorAll('.page');
  const actionBars = document.querySelectorAll('.sidebar-actions');
  const header = $('header-section');

  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetPage = btn.dataset.page;
      
      navBtns.forEach(b => b.classList.toggle('active', b === btn));
      pages.forEach(p => p.classList.toggle('active', p.id === `page-${targetPage}`));
      
      actionBars.forEach(bar => {
        bar.style.display = bar.id === `actions-${targetPage}` ? 'flex' : 'none';
      });

      const actionsLabel = $('nav-actions-lbl');
      if (actionsLabel) {
        actionsLabel.style.display = (targetPage === 'mods' || targetPage === 'songs') ? 'block' : 'none';
      }
    });
  });

  $('actions-mods').style.display = 'flex';
  $('actions-songs').style.display = 'none';
}

async function refreshMods() {
  if (!config.modsStoragePath) return;
  try {
    availableMods = await invoke('get_available_mods');
    renderMods();
    setStatus('● ' + "System ready");
  } catch (err) {
    console.error(err);
  }
}

function renderMods() {
  const container = $('mods-list');
  const emptyState = $('mods-empty');
  const searchTerm = ($('mods-search')?.value || '').toLowerCase();
  const sortBy = $('mods-sort')?.value || 'date';
  const statusFilter = $('mods-status-filter')?.value || 'all';
  
  container.innerHTML = '';
  
  let filtered = availableMods.filter(mod => {
    const matchesSearch = mod.name.toLowerCase().includes(searchTerm) || 
                          mod.folderName.toLowerCase().includes(searchTerm) ||
                          (mod.type && mod.type.toLowerCase().includes(searchTerm));
    
    const matchesStatus = statusFilter === 'all' || 
                          (statusFilter === 'enabled' && mod.enabled) ||
                          (statusFilter === 'disabled' && !mod.enabled);
    
    return matchesSearch && matchesStatus;
  });

  filtered.sort((a, b) => {
    if (sortBy === 'date') return (b.createdAt || 0) - (a.createdAt || 0);
    if (sortBy === 'type') return (a.type || '').localeCompare(b.type || '');
    return a.name.localeCompare(b.name);
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
      <div class="mod-info">
        <div class="mod-name">${mod.name}</div>
        <div class="mod-meta">v${mod.version || '1.0.0'} • ${formatSize(mod.size)} • Added: ${formatDate(mod.createdAt)}</div>
      </div>
      <select class="mod-type-select" data-id="${mod.folderName}">
        <option value="character" ${mod.type === 'character' ? 'selected' : ''}>Character</option>
        <option value="map" ${mod.type === 'map' ? 'selected' : ''}>Map</option>
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

  document.querySelectorAll('.mod-toggle').forEach(el => {
    el.addEventListener('change', (e) => {
      const folderName = e.target.dataset.id;
      const mod = availableMods.find(m => m.folderName === folderName);
      if (mod) mod.enabled = e.target.checked;
      renderMods(); 
    });
  });

  document.querySelectorAll('.mod-type-select').forEach(el => {
    el.addEventListener('change', async (e) => {
      const folderName = e.target.dataset.id;
      const newType = e.target.value;
      const mod = availableMods.find(m => m.folderName === folderName);
      if (mod) {
        mod.type = newType;
        await invoke('update_mod_metadata', { modFolderName: folderName, key: "type", value: newType });
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
        } catch (err) {
          showToast(`Error deleting: ${err}`, 'error');
        }
      }
    });
  });
}

function setupModsEvents() {
  $('btn-refresh-mods').addEventListener('click', refreshMods);
  $('mods-search').addEventListener('input', renderMods);
  $('mods-sort').addEventListener('change', renderMods);
  $('mods-status-filter').addEventListener('change', renderMods);
  
  $('btn-apply').addEventListener('click', async () => {
    setStatus('● ' + "Syncing mods...");
    const activeMods = availableMods.filter(m => m.enabled).map(m => m.folderName);
    
    let characters = 0;
    let maps = 0;
    availableMods.filter(m => m.enabled).forEach(m => {
      if (m.type === 'character') characters++;
      if (m.type === 'map') maps++;
    });

    if (characters > 1) {
      const yes = await ask(`Warning: You have more than one mod of type 'Character' active. This could cause the game to crash. Do you want to continue?`, { title: "Conflict Detected", kind: 'warning' });
      if (!yes) { setStatus('● ' + "System ready"); return; }
    }
    if (maps > 1) {
      const yes = await ask(`Warning: You have more than one mod of type 'Map' active. This could cause the game to crash. Do you want to continue?`, { title: "Conflict Detected", kind: 'warning' });
      if (!yes) { setStatus('● ' + "System ready"); return; }
    }

    try {
      await invoke('sync_mods', { selectedMods: activeMods });
      showToast("Changes applied successfully.", 'success');
      setStatus('● ' + "System ready");
    } catch (err) {
      showToast(`${"Sync error"}: ${err}`, 'error');
      setStatus('● ' + "Sync error", true);
    }
  });

  $('btn-add-mod').addEventListener('click', () => showModal('modal-mod-import-method'));
  $('mod-method-cancel').addEventListener('click', () => closeModal('modal-mod-import-method'));

  $('mod-method-file').addEventListener('click', async () => {
    closeModal('modal-mod-import-method');
    if (!config.modsStoragePath) return showToast("Select storage folder", 'error');
    
    const files = await openDialog({
      multiple: true,
      filters: [{ name: 'ZIP Archives', extensions: ['zip'] }]
    });
    
    if (files && files.length === 1) {
      const file = files[0];
      let defaultName = file.split(/[\\/]/).pop().replace('.zip', '');
      $('install-name-input').value = defaultName;
      $('install-name-input').dataset.archivePath = file;
      showModal('modal-install-mod');
    } else if (files && files.length > 1) {
      try {
        setStatus('● ' + `Installing ${files.length} mods...`);
        showModal('modal-loading');
        for (const file of files) {
          const modName = file.split(/[\\/]/).pop().replace('.zip', '');
          await invoke('install_mod', { archivePath: file, modName, modType: "character" });
          showToast(`Installed mod ${modName}`, 'success');
        }
        closeModal('modal-loading');
        refreshMods();
        setStatus('● ' + "System ready");
      } catch (err) {
        closeModal('modal-loading');
        showToast(`Bulk install failed: ${err}`, 'error');
        setStatus('● ' + "Sync error", true);
      }
    }
  });

  $('mod-method-folder').addEventListener('click', async () => {
    closeModal('modal-mod-import-method');
    if (!config.modsStoragePath) return showToast("Select storage folder", 'error');
    
    const folder = await openDialog({ directory: true });
    if (folder) {
      const modName = folder.split(/[\\/]/).pop();
      try {
        setStatus('● ' + "Importing mod folder...");
        showModal('modal-loading');
        await invoke('import_mod_from_folder', { folderPath: folder, modName, modType: "character" });
        closeModal('modal-loading');
        showToast(`Imported ${modName}`, 'success');
        refreshMods();
        setStatus('● ' + "System ready");
      } catch (err) {
        closeModal('modal-loading');
        showToast(`Import failed: ${err}`, 'error');
        setStatus('● ' + "Sync error", true);
      }
    }
  });

  $('btn-export-mods').addEventListener('click', async () => {
    if (availableMods.length === 0) return showToast("No mods to export.", 'info');
    
    const savePath = await window.__TAURI__.dialog.save({
      filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
      defaultPath: "My_Mods_Export.zip"
    });
    
    if (savePath) {
      try {
        showModal('modal-loading');
        const folderNames = availableMods.map(m => m.folderName);
        await invoke('export_mods', { names: folderNames, path: savePath });
        closeModal('modal-loading');
        showToast("Mods exported successfully!", 'success');
      } catch(err) {
        closeModal('modal-loading');
        showToast(`Export error: ${err}`, 'error');
      }
    }
  });

  $('btn-launch').addEventListener('click', async () => {
    try {
      await invoke('launch_game');
    } catch (err) {
      showToast(`Launch error: ${err}`, 'error');
    }
  });
}

async function refreshSongs() {
  try {
    availableSongs = await invoke('scan_songs');
    renderSongs();
  } catch (err) {
    console.error(err);
  }
}

let audioPlayer = new Audio();
let currentPlayingPath = null;

function renderSongs() {
  const container = $('songs-list');
  const emptyState = $('songs-empty');
  const searchTerm = ($('songs-search')?.value || '').toLowerCase();
  const sortBy = $('songs-sort')?.value || 'date';
  
  container.innerHTML = '';
  
  let filtered = availableSongs.filter(song => 
    song.songName.toLowerCase().includes(searchTerm) || 
    (Array.isArray(song.performedBy) && song.performedBy.some(p => p.toLowerCase().includes(searchTerm)))
  );

  filtered.sort((a, b) => {
    if (sortBy === 'date') return (b.createdAt || 0) - (a.createdAt || 0);
    return a.songName.localeCompare(b.songName);
  });

  if (filtered.length === 0) {
    emptyState.style.display = 'block';
    emptyState.innerHTML = searchTerm ? `<p>No songs matching "${searchTerm}"</p>` : `<p id="songs-placeholder-text">No custom songs found. Import some to get started!</p>`;
    return;
  }
  
  emptyState.style.display = 'none';
  
  filtered.forEach((song) => {
    const songEl = document.createElement('div');
    songEl.className = 'song-item';
    songEl.title = `Added: ${formatDate(song.createdAt)}`;
    
    const artist = Array.isArray(song.performedBy) ? song.performedBy.join(', ') : 'Unknown';
    const isPlaying = currentPlayingPath === song.folderPath;
    const playIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M5 3l14 9-14 9V3z"/></svg>`;
    const pauseIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;

    songEl.innerHTML = `
      <div class="song-info">
        <div class="song-name">${song.songName}</div>
        <div class="song-meta">${artist} • ${song.tempo} BPM • Added: ${formatDate(song.createdAt)}</div>
      </div>
      <div class="song-actions">
        <button class="song-btn btn-play-song ${isPlaying ? 'playing' : ''}" data-path="${song.folderPath}">${isPlaying ? pauseIcon : playIcon}</button>
        <button class="song-btn btn-edit-song" data-path="${song.folderPath}">Edit</button>
        <button class="song-btn danger btn-delete-song" data-path="${song.folderPath}">Delete</button>
      </div>
    `;
    container.appendChild(songEl);
  });

  document.querySelectorAll('.btn-play-song').forEach(el => {
    el.addEventListener('click', async (e) => {
      const path = e.currentTarget.dataset.path;
      if (currentPlayingPath === path) {
        audioPlayer.pause();
        currentPlayingPath = null;
        renderSongs();
      } else {
        try {
          const cleanPath = path.replace(/\\/g, '/');
          const fullPath = cleanPath.endsWith('/') ? cleanPath + 'Audio.ogg' : cleanPath + '/Audio.ogg';
          
          let audioUrl = "";
          try {
            audioUrl = window.__TAURI__.core.convertFileSrc(fullPath);
          } catch (e) {
            console.warn("convertFileSrc failed, using fallback");
          }

          if (!audioUrl || audioUrl.startsWith(fullPath.substring(0, 1))) {
            const encodedPath = fullPath.replace(/:/g, '%3A');
            audioUrl = `https://asset.localhost/${encodedPath}`;
          }

          console.log("Loading audio from:", audioUrl);
          audioPlayer.src = audioUrl;
          await audioPlayer.play();
          currentPlayingPath = path;
          renderSongs();
        } catch (err) {
          console.error("Playback error:", err);
          showToast(`Playback failed: ${err}`, 'error');
        }
      }
    });
  });

  document.querySelectorAll('.btn-delete-song').forEach(el => {
    el.addEventListener('click', async (e) => {
      const path = e.currentTarget.dataset.path;
      const song = availableSongs.find(s => s.folderPath === path);
      const yes = await ask(`Are you sure you want to delete '${song.songName}'?\n\nThis will remove the folder from the game's directory.`, { title: "Delete Song", kind: 'warning' });
      if (yes) {
        try {
          await invoke('delete_song', { folderPath: path });
          showToast(`Deleted ${song.songName}`, 'success');
          await refreshSongs();
        } catch (err) {
          showToast(`Error deleting: ${err}`, 'error');
        }
      }
    });
  });

  document.querySelectorAll('.btn-edit-song').forEach(el => {
    el.addEventListener('click', (e) => {
      const path = e.currentTarget.dataset.path;
      const song = availableSongs.find(s => s.folderPath === path);
      
      $('meta-song-name').value = song.songName || '';
      $('meta-artist').value = Array.isArray(song.performedBy) ? song.performedBy.join(', ') : '';
      $('meta-tempo').value = song.tempo || 120;
      $('meta-beat-offset').value = song.beatOffset || 0;
      $('meta-start-offset').value = song.startSongOffset || 0;
      $('meta-end-offset').value = song.endSongOffset || 0;
      $('modal-song-meta-confirm').dataset.path = path;
      
      showModal('modal-song-meta');
    });
  });
}

function setupSongsEvents() {
  $('btn-refresh-songs').addEventListener('click', refreshSongs);
  $('songs-search').addEventListener('input', renderSongs);
  $('songs-sort').addEventListener('change', renderSongs);
  
  $('btn-import-song').addEventListener('click', () => {
    showModal('modal-import-method');
  });

  const importSharedFn = async () => {
    closeModal('modal-import-method');
    const files = await openDialog({
      multiple: true,
      filters: [{ name: 'ZIP Package', extensions: ['zip'] }]
    });
    if (files && files.length > 0) {
      try {
        setStatus('● ' + `Importing ${files.length} shared package(s)...`);
        showModal('modal-loading');
        for (const file of files) {
          const res = await invoke('import_shared_package', { zipPath: file, strategies: {} });
          showToast(res, 'success');
        }
        closeModal('modal-loading');
        refreshSongs();
        setStatus('● ' + "System ready");
      } catch (err) {
        closeModal('modal-loading');
        showToast(`Import failed: ${err}`, 'error');
        setStatus('● ' + "Sync error", true);
      }
    }
  };

  $('import-method-shared').addEventListener('click', importSharedFn);

  $('import-method-file').addEventListener('click', async () => {
    closeModal('modal-import-method');
    const files = await openDialog({
      multiple: true,
      filters: [{ name: 'Audio/ZIP', extensions: ['ogg', 'mp3', 'wav', 'zip'] }]
    });
    if (files && files.length > 0) {
      try {
        setStatus('● ' + `Importing ${files.length} file(s)...`);
        showModal('modal-loading');
        
        for (const file of files) {
          const res = await invoke('import_song', { path: file, customMetadata: null });
          showToast(res, 'success');
        }
        
        closeModal('modal-loading');
        refreshSongs();
        setStatus('● ' + "System ready");
      } catch (err) {
        closeModal('modal-loading');
        showToast(`Import failed: ${err}`, 'error');
        setStatus('● ' + "Sync error", true);
      }
    }
  });

  $('import-method-folder').addEventListener('click', async () => {
    closeModal('modal-import-method');
    const folder = await openDialog({ directory: true });
    if (folder) {
      try {
        setStatus('● ' + "Importing...");
        showModal('modal-loading');
        const res = await invoke('import_song', { path: folder, customMetadata: null });
        closeModal('modal-loading');
        showToast(res, 'success');
        refreshSongs();
        setStatus('● ' + "System ready");
      } catch (err) {
        closeModal('modal-loading');
        showToast(`Import failed: ${err}`, 'error');
        setStatus('● ' + "Sync error", true);
      }
    }
  });

  $('btn-export-shared').addEventListener('click', async () => {
    if (availableSongs.length === 0) return showToast("No songs to export.", 'info');
    
    const savePath = await window.__TAURI__.dialog.save({
      filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
      defaultPath: "My_Custom_Songs.zip"
    });
    
    if (savePath) {
      try {
        showModal('modal-loading');
        const paths = availableSongs.map(s => s.folderPath);
        await invoke('export_songs', { paths, path: savePath });
        closeModal('modal-loading');
        showToast("Songs exported successfully!", 'success');
      } catch(err) {
        closeModal('modal-loading');
        showToast(`Export error: ${err}`, 'error');
      }
    }
  });

  $('btn-download-songs').addEventListener('click', () => {
    showModal('modal-downloader');
    if (config && config.discomapsApiKey) {
      setTimeout(() => {
        const btn = $('dl-fetch-btn');
        if (btn) btn.click();
      }, 100);
    }
  });
}

function setupConfigEvents() {
  $('exe-browse-btn').addEventListener('click', async () => {
    const file = await openDialog({
      multiple: false,
      filters: [{ name: 'Pagoda Executable', extensions: ['exe'] }]
    });
    if (file) {
      try {
        const res = await invoke('set_exe_path', { path: file });
        $('exe-input').value = file;
        config = res.config;
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
            config = forceRes.config;
            refreshMods();
          }
        } else {
          $('storage-input').value = folder;
          config = res.config;
          refreshMods();
        }
      } catch (err) {
        showToast(`Failed to set storage: ${err}`, 'error');
      }
    }
  });

  $('dl-save-key-btn').addEventListener('click', () => {
    config.discomapsApiKey = $('dl-api-key-input').value;
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
    config.theme = theme;
    saveConfig();
  });

  $('nexus-save-key-btn').addEventListener('click', () => {
    config.nexusApiKey = $('nexus-api-key-input').value;
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

  $('btn-browse-nexus').addEventListener('click', () => showModal('modal-nexus'));
  $('modal-nexus-close').addEventListener('click', () => closeModal('modal-nexus'));
  $('nexus-search-btn').addEventListener('click', () => refreshNexusMods());
  $('nexus-search').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') refreshNexusMods();
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
    } catch(err) {
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
    } catch(err) {
      showToast(`Update failed: ${err}`, 'error');
    }
    closeModal('modal-song-meta');
  });

  $('import-method-cancel').addEventListener('click', () => closeModal('modal-import-method'));

  $('modal-downloader-close').addEventListener('click', () => closeModal('modal-downloader'));
  


  let catalogue = [];
  $('dl-fetch-btn').addEventListener('click', async () => {
    const apiKey = $('dl-api-key-input').value || config.discomapsApiKey;
    if (!apiKey) return showToast("API Key is missing! Go to Settings to add one.", 'error');
    
    $('dl-fetch-btn').disabled = true;
    $('dl-catalogue').innerHTML = `<div class="dl-placeholder">Loading catalogue...</div>`;
    try {
      catalogue = await invoke('fetch_song_catalogue', { apiKey });
      renderCatalogue(catalogue);
    } catch (err) {
      $('dl-catalogue').innerHTML = `<div class="dl-placeholder" style="color:var(--danger)">Failed to fetch: ${err}</div>`;
    } finally {
      $('dl-fetch-btn').disabled = false;
    }
  });$('dl-search').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = catalogue.filter(s => 
      (s.t && s.t.toLowerCase().includes(term)) || 
      (s.a && s.a.toLowerCase().includes(term))
    );
    renderCatalogue(filtered);
  });
}

function renderCatalogue(maps) {
  const container = $('dl-catalogue');
  container.innerHTML = '';
  if (maps.length === 0) {
    container.innerHTML = `<div class="dl-placeholder">No songs found.</div>`;
    return;
  }
  
  maps.forEach(m => {
    const el = document.createElement('div');
    el.className = 'dl-item';
    
    const info = document.createElement('div');
    info.className = 'dl-info';
    
    const title = document.createElement('div');
    title.className = 'dl-title';
    title.innerText = m.t || 'Unknown Title';
    
    const artist = document.createElement('div');
    artist.className = 'dl-artist';
    artist.innerText = m.a || 'Unknown Artist';
    
    const bpm = document.createElement('div');
    bpm.className = 'dl-bpm';
    bpm.innerText = `${m.b || 120} BPM`;
    
    info.appendChild(title);
    info.appendChild(artist);
    info.appendChild(bpm);
    
    const btn = document.createElement('button');
    btn.className = 'dl-btn btn-dl-song';
    btn.innerText = 'Download';
    btn.onclick = async () => {
      const apiKey = $('dl-api-key-input').value || config.discomapsApiKey;
      showModal('modal-loading');
      try {
        const res = await invoke('download_song', { mapEntry: m, apiKey });
        closeModal('modal-loading');
        showToast(res, 'success');
        refreshSongs();
      } catch (err) {
        closeModal('modal-loading');
        showToast(`Download error: ${err}`, 'error');
      }
    };
    
    el.appendChild(info);
    el.appendChild(btn);
    container.appendChild(el);
  });
}

let updateData = null;

async function checkUpdates(silent = false) {
  try {
    const data = await invoke('check_for_updates');
    if (data.isNewer) {
      updateData = data;
      const btn = $('btn-check-updates');
      btn.innerText = "Update Now";
      btn.classList.add('update-ready');
      if (!silent) showUpdateModal();
    } else if (!silent) {
      showToast("You are already using the latest version.", 'info');
    }
  } catch (err) {
    if (!silent) showToast(`Update check failed: ${err}`, 'error');
  }
}

function showUpdateModal() {
  if (!updateData) return;
  $('modal-update-msg').innerText = `A new version (${updateData.latestVersion}) is available.`;
  $('modal-update-changelog').innerText = updateData.changelog;
  $('modal-update-now').onclick = () => {
    window.__TAURI__.shell.open(updateData.htmlUrl);
    closeModal('modal-update');
  };
  $('modal-update-later').onclick = () => closeModal('modal-update');
  showModal('modal-update');
}

$('btn-check-updates').addEventListener('click', () => {
  if (updateData) {
    showUpdateModal();
  } else {
    checkUpdates(false);
  }
});

async function refreshNexusMods() {
  const query = $('nexus-search').value.trim();
  if (!query) return;

  const container = $('nexus-catalogue');
  container.innerHTML = '<div class="dl-placeholder">Searching Nexus...</div>';

  try {
    const mods = await invoke('fetch_nexus_mods', { 
      apiKey: config.nexusApiKey || '', 
      query 
    });
    renderNexusMods(mods);
  } catch (err) {
    container.innerHTML = `<div class="dl-placeholder error">Error: ${err}</div>`;
  }
}

function renderNexusMods(mods) {
  const container = $('nexus-catalogue');
  container.innerHTML = '';

  if (mods.length === 0) {
    container.innerHTML = '<div class="dl-placeholder">No mods found on Nexus.</div>';
    return;
  }

  mods.forEach(m => {
    const el = document.createElement('div');
    el.className = 'dl-item';
    
    const info = document.createElement('div');
    info.className = 'dl-info';
    info.innerHTML = `
      <div class="dl-name">${m.name}</div>
      <div class="dl-meta">by ${m.author} // v${m.version}</div>
    `;

    const btn = document.createElement('button');
    btn.className = 'dl-btn';
    btn.innerText = 'Download';
    btn.onclick = async () => {
      btn.disabled = true;
      btn.innerText = 'Installing...';
      try {
        const res = await invoke('download_nexus_mod', {
          apiKey: config.nexusApiKey || '',
          modId: m.mod_id,
          storagePath: config.modsStoragePath
        });
        showToast(res, 'success');
        btn.innerText = 'Installed';
        refreshMods();
      } catch (err) {
        if (err === "PREMIUM_REQUIRED") {
          const yes = await confirm("Direct API downloads require a Nexus Premium account. Would you like to open the manual download page instead?", { title: "Nexus Premium Required", kind: 'info' });
          if (yes) {
            window.__TAURI__.shell.open(`https://www.nexusmods.com/deadasdisco/mods/${m.mod_id}?tab=files`);
          }
        } else {
          showToast(err, 'error');
        }
        btn.disabled = false;
        btn.innerText = 'Download';
      }
    };

    el.appendChild(info);
    el.appendChild(btn);
    container.appendChild(el);
  });
}
