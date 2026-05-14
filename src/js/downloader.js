import { invoke, ask } from './api.js';
import { $, showToast, showModal, closeModal } from './utils.js';
import { refreshSongs } from './songs.js';
import { state } from './state.js';

let catalogue = [];

export function setupDownloaderEvents() {
  const fetchBtn = $('dl-fetch-btn');
  if (!fetchBtn) return;

  fetchBtn.addEventListener('click', () => refreshCatalogue());

  $('dl-search')?.addEventListener('input', () => renderCatalogue());
  $('dl-sort')?.addEventListener('change', () => renderCatalogue());
  $('dl-sort-order')?.addEventListener('click', () => {
    $('dl-sort-order').classList.toggle('desc');
    renderCatalogue();
  });
}

export async function refreshCatalogue() {
  const fetchBtn = $('dl-fetch-btn');
  const apiKey = $('dl-api-key-input')?.value || state.config.discomapsApiKey;
  if (!apiKey) return;

  if (fetchBtn) fetchBtn.disabled = true;
  $('dl-catalogue').innerHTML = `<div class="dl-placeholder">Loading catalogue...</div>`;
  try {
    catalogue = await invoke('fetch_song_catalogue', { apiKey });
    renderCatalogue();
  } catch (err) {
    $('dl-catalogue').innerHTML = `<div class="dl-placeholder" style="color:var(--danger)">Failed to fetch: ${err}</div>`;
  } finally {
    if (fetchBtn) fetchBtn.disabled = false;
  }
}

export function autoFetchCatalogue() {
  if (catalogue.length === 0) {
    refreshCatalogue();
  }
}

function renderCatalogue() {
  const container = $('dl-catalogue');
  if (!container) return;
  container.innerHTML = '';
  
  if (catalogue.length === 0) {
    container.innerHTML = `<div class="dl-placeholder">Click 'Fetch' to see available songs.</div>`;
    return;
  }

  const term = $('dl-search')?.value.toLowerCase() || '';
  const sortBy = $('dl-sort')?.value || 'name';
  const isDesc = $('dl-sort-order')?.classList.contains('desc');

  let filtered = catalogue.filter(s =>
    (s.t && s.t.toLowerCase().includes(term)) ||
    (s.a && s.a.toLowerCase().includes(term))
  );

  filtered.sort((a, b) => {
    let res = 0;
    if (sortBy === 'bpm') {
      res = (a.b || 0) - (b.b || 0);
    } else if (sortBy === 'artist') {
      res = (a.a || '').localeCompare(b.a || '');
    } else if (sortBy === 'date') {
      res = (a.id || '').localeCompare(b.id || '', undefined, { numeric: true });
    } else {
      res = (a.t || '').localeCompare(b.t || '');
    }
    return isDesc ? -res : res;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div class="dl-placeholder">No songs match your search.</div>`;
    return;
  }

  filtered.forEach(m => {
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

    const installedSong = state.availableSongs.find(s =>
      s.discomapsId === m.id ||
      (s.songName === m.t && (Array.isArray(s.performedBy) ? s.performedBy.includes(m.a) : s.performedBy === m.a))
    );

    const btn = document.createElement('button');
    btn.className = 'dl-btn btn-dl-song';
    if (installedSong) {
      btn.innerText = 'Redownload';
    } else {
      btn.innerText = 'Download';
    }

    btn.onclick = async () => {
      if (installedSong) {
        const yes = await ask(`Are you sure you want to redownload <strong>${m.t}</strong> by <strong>${m.a}</strong>?`, {
          title: "Redownload Song",
          kind: 'info'
        });
        if (!yes) return;
      }

      const apiKey = $('dl-api-key-input').value || state.config.discomapsApiKey;
      showModal('modal-loading');
      try {
        const res = await invoke('download_song', {
          mapEntry: m,
          apiKey,
          replacePath: installedSong ? installedSong.folderPath : null
        });
        closeModal('modal-loading');
        showToast(res, 'success');
        await refreshSongs();
        renderCatalogue();
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
