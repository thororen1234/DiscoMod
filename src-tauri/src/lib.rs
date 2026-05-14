mod mod_manager;
mod nexus;
mod saves;
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
            mod_manager::get_build_info,
            mod_manager::open_folder,
            mod_manager::open_game_root,
            mod_manager::open_active_mods_folder,
            mod_manager::open_logic_mods_folder,
            mod_manager::launch_game,
            mod_manager::open_config_dir,
            mod_manager::open_themes_dir,
            mod_manager::list_themes,
            mod_manager::read_theme,
            mod_manager::install_ue4ss,
            mod_manager::is_ue4ss_installed,
            mod_manager::uninstall_ue4ss,
            mod_manager::scan_path_for_mods,
            mod_manager::import_mods_from_zip,
            songs::scan_path_for_songs,
            songs::import_songs_from_zip,
            songs::scan_songs,
            songs::delete_song,
            songs::update_song_metadata,
            songs::import_song,
            songs::export_songs,
            songs::import_shared_package,
            songs::fetch_song_catalogue,
            songs::download_song,
            songs::open_songs_dir,
            nexus::fetch_nexus_mods,
            nexus::download_nexus_mod,
            saves::list_game_saves,
            saves::backup_save,
            saves::list_backups,
            saves::restore_save,
            saves::delete_backup,
            saves::open_saves_dir,
            saves::import_save,
            saves::read_save_data,
            saves::write_save_data,
            saves::export_saves,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
