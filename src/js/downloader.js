import { invoke } from './api.js';
import { $, showToast, showModal, closeModal } from './utils.js';
import { refreshSongs } from './songs.js';
import { state } from './state.js';

let catalogue = [];

export function setupDownloaderEvents() {
  const fetchBtn = $('dl-fetch-btn');
  if (!fetchBtn) return;

  fetchBtn.addEventListener('click', () => refreshCatalogue());

  $('dl-search')?.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = catalogue.filter(s =>
      (s.t && s.t.toLowerCase().includes(term)) ||
      (s.a && s.a.toLowerCase().includes(term))
    );
    renderCatalogue(filtered);
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
    renderCatalogue(catalogue);
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
      const apiKey = $('dl-api-key-input').value || state.config.discomapsApiKey;
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
