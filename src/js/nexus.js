import { invoke, ask, openUrl } from './api.js';
import { $, showToast, showModal, closeModal } from './utils.js';
import { refreshMods } from './mods.js';
import { state } from './state.js';

let nexusMods = [];

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
    nexusMods = mods;
    renderNexusMods();
  } catch (err) {
    container.innerHTML = `<div class="dl-placeholder error">Error: ${err}</div>`;
  }
}

function renderNexusMods() {
  const container = $('nexus-catalogue');
  container.innerHTML = '';

  if (nexusMods.length === 0) {
    container.innerHTML = '<div class="dl-placeholder">No mods found on Nexus.</div>';
    return;
  }

  const sortBy = $('nexus-sort')?.value || 'name';
  const isDesc = $('nexus-sort-order')?.classList.contains('desc');

  let sortedMods = [...nexusMods];
  sortedMods.sort((a, b) => {
    let res = 0;
    if (sortBy === 'date') {
      res = (a.updatedTimestamp || 0) - (b.updatedTimestamp || 0);
    } else {
      res = a.name.localeCompare(b.name);
    }
    return isDesc ? -res : res;
  });

  sortedMods.forEach(m => {
    const el = document.createElement('div');
    el.className = 'dl-item';

    const info = document.createElement('div');
    info.className = 'dl-info';
    info.innerHTML = `
      <div class="dl-name">${m.name}</div>
      <div class="dl-meta">by ${m.author} // v${m.version}</div>
    `;

    const installedMod = state.availableMods.find(mod => mod.nexusId === m.modId);

    const btn = document.createElement('button');
    btn.className = 'dl-btn';

    if (installedMod) {
      if (installedMod.version !== m.version) {
        btn.innerText = 'Update';
        btn.classList.add('accent');
      } else {
        btn.innerText = 'Redownload';
      }
    } else {
      btn.innerText = 'Download';
    }

    btn.onclick = async () => {
      if (installedMod) {
        let msg = '';
        if (installedMod.version !== m.version) {
          msg = `Would you like to replace version <strong>${installedMod.version}</strong> with <strong>${m.version}</strong>?`;
        } else {
          msg = `Are you sure you want to redownload <strong>${m.name}</strong> by <strong>${m.author}</strong>?`;
        }

        const yes = await ask(msg, {
          title: installedMod.version !== m.version ? "Update Mod" : "Redownload Mod",
          kind: 'info'
        });
        if (!yes) return;
      }

      btn.disabled = true;
      btn.innerText = installedMod ? 'Updating...' : 'Installing...';
      try {
        const res = await invoke('download_nexus_mod', {
          apiKey: state.config.nexusApiKey || '',
          modId: m.modId,
          storagePath: state.config.modsStoragePath,
          replacePath: installedMod ? installedMod.folderPath : null
        });
        showToast(res, 'success');
        btn.innerText = 'Installed';
        await refreshMods();
        renderNexusMods();
      } catch (err) {
        if (err === "PREMIUM_REQUIRED") {
          state.currentPremiumModId = m.modId;
          showModal('modal-premium');
        } else {
          showToast(err, 'error');
        }
        btn.disabled = false;
        btn.innerText = installedMod ? (installedMod.version !== m.version ? 'Update' : 'Redownload') : 'Download';
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
  
  $('nexus-sort')?.addEventListener('change', () => renderNexusMods());
  $('nexus-sort-order')?.addEventListener('click', () => {
    $('nexus-sort-order').classList.toggle('desc');
    renderNexusMods();
  });
}
