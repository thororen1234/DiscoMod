import { invoke, ask, openDialog, openUrl } from './api.js';
import { $, formatDate, showToast, setStatus, showModal, closeModal, showImportSelectionModal } from './utils.js';
import { saveConfig } from './config.js';
import { state } from './state.js';

let audioPlayer = new Audio();

export async function refreshSongs(silent = false) {
  try {
    const newSongs = await invoke('scan_songs');
    if (silent && JSON.stringify(newSongs) === JSON.stringify(state.availableSongs)) return;

    state.availableSongs = newSongs;
    renderSongs();
  } catch (err) {
    console.error(err);
  }
}

export function renderSongs() {
  const container = $('songs-list');
  const emptyState = $('songs-empty');
  const searchTerm = ($('songs-search')?.value || '').toLowerCase();
  const sortBy = $('songs-sort')?.value || 'name';
  const sortOrder = $('songs-sort-order')?.classList.contains('desc') ? 'desc' : 'asc';

  container.innerHTML = '';
  const stats = $('songs-stats');
  if (stats) stats.innerText = `${state.availableSongs.length} songs`;

  let filtered = state.availableSongs.filter(song =>
    song.songName.toLowerCase().includes(searchTerm) ||
    (Array.isArray(song.performedBy) && song.performedBy.some(p => p.toLowerCase().includes(searchTerm)))
  );

  filtered.sort((a, b) => {
    let res = 0;
    if (sortBy === 'date') res = (a.createdAt || 0) - (b.createdAt || 0);
    else if (sortBy === 'bpm') res = (a.tempo || 0) - (b.tempo || 0);
    else if (sortBy === 'artist') {
      const artA = Array.isArray(a.performedBy) ? a.performedBy.join('') : '';
      const artB = Array.isArray(b.performedBy) ? b.performedBy.join('') : '';
      res = artA.localeCompare(artB);
    } else {
      res = a.songName.localeCompare(b.songName);
    }

    if (sortOrder === 'desc') return -res;
    return res;
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
    const isPlaying = state.currentPlayingPath === song.folderPath;
    const playIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M5 3l14 9-14 9V3z"/></svg>`;
    const pauseIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;

    songEl.innerHTML = `
      <div class="col-select" style="margin-right: 12px;">
        <label class="checkbox-container">
          <input type="checkbox" class="song-item-check" data-path="${song.folderPath}">
          <span class="checkmark"></span>
        </label>
      </div>
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

  attachSongEvents();
  updateSongsBulkUI();
}

function attachSongEvents() {
  document.querySelectorAll('.btn-play-song').forEach(el => {
    el.addEventListener('click', async (e) => {
      const path = e.currentTarget.dataset.path;
      if (state.currentPlayingPath === path) {
        audioPlayer.pause();
        state.currentPlayingPath = null;
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

          audioPlayer.src = audioUrl;
          await audioPlayer.play();
          state.currentPlayingPath = path;
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
      const song = state.availableSongs.find(s => s.folderPath === path);
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
      const song = state.availableSongs.find(s => s.folderPath === path);

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

  document.querySelectorAll('.song-item-check').forEach(el => {
    el.addEventListener('change', updateSongsBulkUI);
  });
}

function updateSongsBulkUI() {
  const checks = document.querySelectorAll('.song-item-check:checked');
  const bar = $('songs-bulk-actions');
  const count = $('songs-selected-count');
  const selectAll = $('songs-select-all');

  if (checks.length > 0) {
    bar.style.display = 'flex';
    count.innerText = `${checks.length} item${checks.length === 1 ? '' : 's'} selected`;
  } else {
    bar.style.display = 'none';
  }

  const allChecks = document.querySelectorAll('.song-item-check');
  if (selectAll) {
    selectAll.checked = allChecks.length > 0 && checks.length === allChecks.length;
  }
}

export function setupSongsEvents() {
  $('songs-search').addEventListener('input', renderSongs);
  $('songs-sort').addEventListener('change', () => {
    state.config.songsSort = $('songs-sort').value;
    renderSongs();
    saveConfig();
  });
  $('songs-sort-order')?.addEventListener('click', () => {
    $('songs-sort-order').classList.toggle('desc');
    state.config.songsSortOrder = $('songs-sort-order').classList.contains('desc') ? 'desc' : 'asc';
    renderSongs();
    saveConfig();
  });

  $('btn-import-song').addEventListener('click', () => {
    showModal('modal-import-method');
  });

  $('import-method-file').addEventListener('click', async () => {
    closeModal('modal-import-method');
    const files = await openDialog({
      multiple: true,
      filters: [{ name: 'Song Packages', extensions: ['zip', 'ogg', 'mp3', 'wav'] }]
    });
    if (files && files.length > 0) {
      try {
        let allScannedItems = [];
        showModal('modal-loading');
        setStatus('● ' + `Scanning ${files.length} file(s)...`);

        for (const file of files) {
          const lower = file.toLowerCase();
          if (lower.endsWith('.zip')) {
            const items = await invoke('scan_path_for_songs', { path: file });
            items.forEach(item => { item.sourceFile = file; });
            allScannedItems = allScannedItems.concat(items);
          } else {
            allScannedItems.push({ name: file.split(/[\\/]/).pop(), internal_path: file, sourceFile: file, isDirect: true });
          }
        }
        closeModal('modal-loading');

        if (allScannedItems.length === 0) {
          showToast("No valid songs found in selected files", 'info');
          setStatus('● ' + "System ready");
          return;
        }

        let selectedItems = allScannedItems;
        if (allScannedItems.length > 1) {
          selectedItems = await showImportSelectionModal("Select Songs to Import", allScannedItems);
          if (!selectedItems || selectedItems.length === 0) {
            setStatus('● ' + "System ready");
            return;
          }
        }

        setStatus('● ' + `Importing ${selectedItems.length} song(s)...`);
        showModal('modal-loading');

        const zipGroups = {};
        for (const item of selectedItems) {
          if (item.isDirect) {
            await invoke('import_song', { path: item.internal_path, customMetadata: null });
          } else {
            if (!zipGroups[item.sourceFile]) zipGroups[item.sourceFile] = [];
            zipGroups[item.sourceFile].push(item.internal_path);
          }
        }

        for (const [zipPath, internals] of Object.entries(zipGroups)) {
          await invoke('import_songs_from_zip', { zipPath, internalPaths: internals });
        }

        closeModal('modal-loading');
        showToast(`Successfully imported ${selectedItems.length} items`, 'success');
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
        showModal('modal-loading');
        setStatus('● ' + "Scanning folder...");
        const items = await invoke('scan_path_for_songs', { path: folder });
        closeModal('modal-loading');

        if (items.length === 0) {
          showToast("No valid songs found in folder", 'info');
          setStatus('● ' + "System ready");
          return;
        }

        let selectedItems = items;
        if (items.length > 1) {
          selectedItems = await showImportSelectionModal("Select Songs to Import", items);
          if (!selectedItems || selectedItems.length === 0) {
            setStatus('● ' + "System ready");
            return;
          }
        }

        setStatus('● ' + "Importing...");
        showModal('modal-loading');
        for (const item of selectedItems) {
          await invoke('import_song', { path: item.internal_path, customMetadata: null });
        }
        closeModal('modal-loading');
        showToast(`Imported ${selectedItems.length} songs`, 'success');
        refreshSongs();
        setStatus('● ' + "System ready");
      } catch (err) {
        closeModal('modal-loading');
        showToast(`Import failed: ${err}`, 'error');
        setStatus('● ' + "Sync error", true);
      }
    }
  });

  $('btn-export-songs').addEventListener('click', async () => {
    if (state.availableSongs.length === 0) return showToast("No songs to export.", 'info');

    const items = state.availableSongs.map(s => ({ name: s.songName, folderPath: s.folderPath }));
    const selected = await showImportSelectionModal("Select Songs to Export", items, "Export Selected");

    if (!selected || selected.length === 0) {
      setStatus('● ' + "System ready");
      return;
    }

    const savePath = await window.__TAURI__.dialog.save({
      filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
      defaultPath: "My_Custom_Songs.zip"
    });

    if (savePath) {
      try {
        showModal('modal-loading');
        const paths = selected.map(s => s.folderPath);
        await invoke('export_songs', { paths, path: savePath });
        closeModal('modal-loading');
        showToast(`Exported ${selected.length} song(s)`, 'success');
      } catch (err) {
        closeModal('modal-loading');
        showToast(`Export error: ${err}`, 'error');
      }
    }
  });

  $('btn-open-songs-dir')?.addEventListener('click', async () => {
    try {
      await invoke('open_songs_dir');
    } catch (err) {
      showToast(`Error: ${err}`, 'error');
    }
  });

  $('songs-select-all')?.addEventListener('change', (e) => {
    document.querySelectorAll('.song-item-check').forEach(cb => {
      cb.checked = e.target.checked;
    });
    updateSongsBulkUI();
  });

  $('btn-bulk-delete-songs')?.addEventListener('click', async () => {
    const selected = Array.from(document.querySelectorAll('.song-item-check:checked')).map(cb => cb.dataset.path);
    if (selected.length === 0) return;

    const yes = await ask(`Are you sure you want to permanently delete ${selected.length} selected song${selected.length === 1 ? '' : 's'}?`, { title: "Confirm Bulk Deletion", kind: 'warning' });
    if (yes) {
      try {
        showModal('modal-loading');
        for (const path of selected) {
          await invoke('delete_song', { folderPath: path });
        }
        closeModal('modal-loading');
        showToast(`Deleted ${selected.length} songs`, 'success');
        await refreshSongs();
      } catch (err) {
        closeModal('modal-loading');
        showToast(`Error during bulk deletion: ${err}`, 'error');
      }
    }
  });
}
