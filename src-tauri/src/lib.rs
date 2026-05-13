mod mod_manager;
mod nexus;
mod songs;
mod utils;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            mod_manager::load_config,
            mod_manager::save_config,
            mod_manager::set_exe_path,
            mod_manager::set_storage_path,
            mod_manager::get_available_mods,
            mod_manager::sync_mods,
            mod_manager::install_mod,
            mod_manager::delete_mod,
            mod_manager::rename_mod,
            mod_manager::export_mods,
            mod_manager::import_mod_from_folder,
            mod_manager::check_for_migration,
            mod_manager::migrate_mods,
            mod_manager::update_mod_metadata,
            mod_manager::launch_game,
            songs::scan_songs,
            songs::delete_song,
            songs::update_song_metadata,
            songs::import_song,
            songs::export_songs,
            songs::import_shared_package,
            songs::fetch_song_catalogue,
            songs::download_song,
            nexus::fetch_nexus_mods,
            nexus::download_nexus_mod,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
