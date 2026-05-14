import { invoke } from './api.js';
import { $, showToast, setStatus } from './utils.js';
import { state } from './state.js';
import { refreshMods } from './mods.js';
import { refreshSongs } from './songs.js';

export async function loadConfig() {
  try {
    state.config = await invoke('load_config');
    $('exe-input').value = state.config.exePath || '';
    $('storage-input').value = state.config.modsStoragePath || '';

    if (state.config.discomapsApiKey) $('dl-api-key-input').value = state.config.discomapsApiKey;
    if (state.config.nexusApiKey) $('nexus-api-key-input').value = state.config.nexusApiKey;
    if (state.config.theme) {
      document.documentElement.setAttribute('data-theme', state.config.theme);
      $('theme-select').value = state.config.theme;

      const themeLabel = $('theme-current-label');
      const selectedOption = document.querySelector(`.custom-option[data-value="${state.config.theme}"]`);
      if (themeLabel && selectedOption) {
        themeLabel.innerText = selectedOption.innerText;
        document.querySelectorAll('.custom-option').forEach(o => o.classList.toggle('selected', o === selectedOption));
      }
    }
    if (state.config.modsSort) $('mods-sort').value = state.config.modsSort;
    if (state.config.modsStatusFilter) $('mods-status-filter').value = state.config.modsStatusFilter;
    if (state.config.songsSort) $('songs-sort').value = state.config.songsSort;
  } catch (err) {
    console.error("Failed to load config:", err);
  }
}

export async function saveConfig() {
  try {
    await invoke('save_config', { config: state.config });
  } catch (err) {
    showToast(`Sync error: ${err}`, 'error');
    setStatus('● ' + "Sync error", true);
  }
}

export async function loadCustomThemes(silent = false) {
  try {
    const themes = await invoke('list_themes');
    if (!themes || !Array.isArray(themes)) return;


    if (silent && state.availableThemes && JSON.stringify(themes) === JSON.stringify(state.availableThemes)) return;
    state.availableThemes = themes;

    const optionsContainer = $('theme-options');
    const nativeSelect = $('theme-select');
    if (!optionsContainer || !nativeSelect) return;

    if (document.querySelector('.custom-option-group-label')) return;

    const group = document.createElement('div');
    group.className = 'custom-option-group custom-option-group-label';
    group.innerText = 'Custom Themes';
    optionsContainer.appendChild(group);

    for (const theme of themes) {
      if (!Array.isArray(theme) || theme.length < 2) continue;
      const [name, path] = theme;

      try {
        const cssContent = await invoke('read_theme', { path });
        const style = document.createElement('style');
        style.id = `custom-theme-${name}`;
        style.textContent = cssContent;
        document.head.appendChild(style);
      } catch (e) {
        console.error("Failed to read theme content:", name, e);
        continue;
      }

      const opt = document.createElement('div');
      opt.className = 'custom-option';
      opt.dataset.value = name;
      opt.innerText = name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      optionsContainer.appendChild(opt);

      const nativeOpt = document.createElement('option');
      nativeOpt.value = name;
      nativeOpt.innerText = opt.innerText;
      nativeSelect.appendChild(nativeOpt);
    }

    if (state.config.theme) {
      const selectedOption = document.querySelector(`.custom-option[data-value="${state.config.theme}"]`);
      if (selectedOption) {
        $('theme-current-label').innerText = selectedOption.innerText;
        document.querySelectorAll('.custom-option').forEach(o => o.classList.toggle('selected', o === selectedOption));
      }
    }
  } catch (e) {
    console.error("Failed to load custom themes:", e);
  }
}
