const { invoke } = window.__TAURI__.core;
const { open: openDialog, message, ask, confirm } = window.__TAURI__.dialog;
const { openUrl } = window.__TAURI__.opener;
const { getCurrentWindow } = window.__TAURI__.window;
const { check: checkUpdate } = window.__TAURI__.updater;

export { invoke, openDialog, message, ask, confirm, openUrl, getCurrentWindow, checkUpdate };
