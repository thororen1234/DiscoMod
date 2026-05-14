import { invoke, openUrl } from './api.js';
import { $, showToast, showModal, closeModal } from './utils.js';
import { refreshMods } from './mods.js';
import { state } from './state.js';

export async function refreshNexusMods() {
  const query = $('nexus-search').value.trim();
  if (!query) return;

  const container = $('nexus-catalogue');
  container.innerHTML = '<div class="dl-placeholder">Searching Nexus...</div>';

  try {
    const mods = await invoke('fetch_nexus_mods', {
      apiKey: state.config.nexusApiKey || '',
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
          apiKey: state.config.nexusApiKey || '',
          modId: m.mod_id,
          storagePath: state.config.modsStoragePath
        });
        showToast(res, 'success');
        btn.innerText = 'Installed';
        refreshMods();
      } catch (err) {
        if (err === "PREMIUM_REQUIRED") {
          state.currentPremiumModId = m.mod_id;
          showModal('modal-premium');
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

export function setupNexusEvents() {
  $('nexus-search-btn')?.addEventListener('click', refreshNexusMods);
  $('nexus-search')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') refreshNexusMods();
  });

  $('modal-premium-cancel')?.addEventListener('click', () => closeModal('modal-premium'));
  $('modal-premium-manual')?.addEventListener('click', () => {
    if (state.currentPremiumModId) {
      openUrl(`https://www.nexusmods.com/deadasdisco/mods/${state.currentPremiumModId}?tab=files`);
    }
    closeModal('modal-premium');
  });
}
