use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use crate::utils::config_dir;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    #[serde(default)]
    pub exe_path: String,
    #[serde(default)]
    pub mods_storage_path: String,
    #[serde(default)]
    pub active_mods: Vec<String>,
    #[serde(default)]
    pub steam_appid: String,
    #[serde(default = "default_lang")]
    pub language: String,
    #[serde(default)]
    pub last_update_check: f64,
    #[serde(default)]
    pub discomaps_api_key: String,
    #[serde(default)]
    pub nexus_api_key: String,
    #[serde(default = "default_theme")]
    pub theme: String,
}

fn default_theme() -> String {
    "dark".to_string()
}

fn default_lang() -> String {
    "en".to_string()
}

impl Default for Config {
    fn default() -> Self {
        Self {
            exe_path: String::new(),
            mods_storage_path: String::new(),
            active_mods: vec![],
            steam_appid: String::new(),
            language: "en".to_string(),
            last_update_check: 0.0,
            discomaps_api_key: String::new(),
            nexus_api_key: String::new(),
            theme: "dark".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModMetadata {
    pub name: String,
    #[serde(rename = "type")]
    pub mod_type: String,
    #[serde(default)]
    pub enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub folder_name: Option<String>,
    #[serde(default)]
    pub created_at: i64,
    #[serde(default)]
    pub size: u64,
    #[serde(default = "default_mod_version")]
    pub version: String,
}

fn default_mod_version() -> String {
    "1.0.0".to_string()
}

fn get_dir_size(path: &Path) -> u64 {
    if !path.exists() {
        return 0;
    }
    if path.is_file() {
        return path.metadata().map(|m| m.len()).unwrap_or(0);
    }
    fs::read_dir(path)
        .map(|entries| entries.flatten().map(|e| get_dir_size(&e.path())).sum())
        .unwrap_or(0)
}

fn config_file() -> PathBuf {
    config_dir().join("config.json")
}

fn read_config() -> Config {
    let path = config_file();
    if path.exists() {
        if let Ok(data) = fs::read_to_string(&path) {
            if let Ok(cfg) = serde_json::from_str::<Config>(&data) {
                return cfg;
            }
        }
    }
    Config::default()
}

fn write_config(cfg: &Config) -> Result<(), String> {
    let path = config_file();
    let json = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_config() -> Config {
    read_config()
}

#[tauri::command]
pub fn save_config(config: Config) -> Result<(), String> {
    write_config(&config)
}

fn find_active_mods_path(exe_path: &str) -> Option<PathBuf> {
    let p = Path::new(exe_path);
    if !p.exists() {
        return None;
    }

    let mut possible_roots: Vec<PathBuf> = vec![p.parent()?.to_path_buf()];

    for ancestor in p.ancestors() {
        let name = match ancestor.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_lowercase(),
            None => continue,
        };
        if name == "win64" || name == "binaries" {
            if let Some(parent) = ancestor.parent() {
                if !possible_roots.contains(&parent.to_path_buf()) {
                    possible_roots.push(parent.to_path_buf());
                }
            }
        }
    }

    let stem = p
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string();

    for root in &possible_roots {
        for folder_name in &["Pagoda", stem.as_str()] {
            let paks = root.join(folder_name).join("Content").join("Paks");
            if paks.exists() {
                let mods = paks.join("~mods");
                fs::create_dir_all(&mods).ok();
                return Some(mods);
            }
        }
        let paks = root.join("Content").join("Paks");
        if paks.exists() {
            let mods = paks.join("~mods");
            fs::create_dir_all(&mods).ok();
            return Some(mods);
        }
    }

    for root in &possible_roots {
        if let Ok(entries) = fs::read_dir(root) {
            for entry in entries.flatten() {
                if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                    let paks = entry.path().join("Content").join("Paks");
                    if paks.exists() {
                        let mods = paks.join("~mods");
                        fs::create_dir_all(&mods).ok();
                        return Some(mods);
                    }
                }
            }
        }
    }

    None
}

fn detect_steam_appid(exe_path: &str) -> String {
    let p = Path::new(exe_path);
    let mut game_folder: Option<String> = None;
    let mut steamapps_path: Option<PathBuf> = None;

    for ancestor in p.ancestors() {
        let name_lower = ancestor
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_lowercase();

        if name_lower == "common" {
            let mut child = p;
            while let Some(par) = child.parent() {
                if par == ancestor {
                    game_folder = child
                        .file_name()
                        .and_then(|n| n.to_str())
                        .map(|s| s.to_string());
                    break;
                }
                child = par;
            }
            steamapps_path = ancestor.parent().map(|p| p.to_path_buf());
            break;
        }
        if name_lower == "steamapps" {
            steamapps_path = Some(ancestor.to_path_buf());
            break;
        }
    }

    let steamapps = match steamapps_path {
        Some(p) if p.exists() => p,
        _ => return String::new(),
    };

    let game_folder = game_folder.unwrap_or_else(|| {
        p.parent()
            .and_then(|p| p.file_name())
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string()
    });

    if let Ok(entries) = fs::read_dir(&steamapps) {
        for entry in entries.flatten() {
            let fname = entry.file_name();
            let fname_str = fname.to_str().unwrap_or("");
            if fname_str.starts_with("appmanifest_") && fname_str.ends_with(".acf") {
                if let Ok(content) = fs::read_to_string(entry.path()) {
                    let re = regex::Regex::new(r#""installdir"\s+"([^"]+)""#).unwrap();
                    if let Some(caps) = re.captures(&content) {
                        if caps[1].to_lowercase() == game_folder.to_lowercase() {
                            let id_re = regex::Regex::new(r"appmanifest_(\d+)\.acf").unwrap();
                            if let Some(id_caps) = id_re.captures(fname_str) {
                                return id_caps[1].to_string();
                            }
                        }
                    }
                }
            }
        }
    }

    String::new()
}

#[tauri::command]
pub fn set_exe_path(path: String) -> Result<serde_json::Value, String> {
    let mut cfg = read_config();
    cfg.exe_path = path.clone();
    cfg.steam_appid = detect_steam_appid(&path);

    let valid = find_active_mods_path(&path).is_some();
    write_config(&cfg)?;

    Ok(serde_json::json!({
        "valid": valid,
        "steamAppid": cfg.steam_appid,
        "config": cfg,
    }))
}

#[tauri::command]
pub fn set_storage_path(path: String, force: bool) -> Result<serde_json::Value, String> {
    if !force {
        let p = Path::new(&path);
        let name = p
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_lowercase();
        let parent_name = p
            .parent()
            .and_then(|p| p.file_name())
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_lowercase();
        let restricted = ["paks", "mods", "~mods"];
        if restricted.contains(&name.as_str()) || restricted.contains(&parent_name.as_str()) {
            return Ok(serde_json::json!({"success": false, "error": "error_storage_inside_game"}));
        }
    }

    let mut cfg = read_config();
    cfg.mods_storage_path = path;
    write_config(&cfg)?;
    Ok(serde_json::json!({"success": true, "config": cfg}))
}

fn ensure_mod_json(mod_path: &Path) -> Option<ModMetadata> {
    let json_path = mod_path.join("mod.json");
    let folder_name = mod_path.file_name()?.to_str()?.to_string();

    let mut meta = ModMetadata {
        name: folder_name.clone(),
        mod_type: "other".to_string(),
        enabled: false,
        folder_name: Some(folder_name),
        created_at: 0,
        size: get_dir_size(mod_path),
        version: "1.0.0".to_string(),
    };

    if json_path.exists() {
        if let Ok(data) = fs::read_to_string(&json_path) {
            if let Ok(parsed) = serde_json::from_str::<ModMetadata>(&data) {
                meta.name = parsed.name;
                meta.mod_type = parsed.mod_type;
                meta.created_at = parsed.created_at;
                meta.version = parsed.version;
            }
        }
    }

    if meta.created_at == 0 {
        if let Ok(metadata) = fs::metadata(mod_path) {
            if let Ok(created) = metadata.created() {
                if let Ok(duration) = created.duration_since(std::time::UNIX_EPOCH) {
                    meta.created_at = duration.as_secs() as i64;
                }
            } else if let Ok(modified) = metadata.modified() {
                if let Ok(duration) = modified.duration_since(std::time::UNIX_EPOCH) {
                    meta.created_at = duration.as_secs() as i64;
                }
            }
        }
    }

    let save_data = serde_json::json!({
        "name": meta.name,
        "type": meta.mod_type,
        "enabled": meta.enabled,
        "createdAt": meta.created_at,
        "version": meta.version,
    });
    fs::write(
        &json_path,
        serde_json::to_string_pretty(&save_data).unwrap_or_default(),
    )
    .ok();

    Some(meta)
}

#[tauri::command]
pub fn get_available_mods() -> Vec<ModMetadata> {
    let cfg = read_config();
    let storage = &cfg.mods_storage_path;
    if storage.is_empty() || !Path::new(storage).exists() {
        return vec![];
    }

    let storage_path = Path::new(storage);
    let mut mods: Vec<ModMetadata> = vec![];

    if let Ok(entries) = fs::read_dir(storage_path) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();
            if name.starts_with('_') {
                continue;
            }

            let has_pak = fs::read_dir(&path)
                .map(|entries| {
                    entries.flatten().any(|e| {
                        e.path()
                            .extension()
                            .and_then(|x| x.to_str())
                            .map(|x| x == "pak")
                            .unwrap_or(false)
                    })
                })
                .unwrap_or(false);

            let has_mod_json = path.join("mod.json").exists();

            if has_pak || has_mod_json {
                if let Some(mut meta) = ensure_mod_json(&path) {
                    meta.enabled = cfg
                        .active_mods
                        .contains(&meta.folder_name.clone().unwrap_or_default());
                    mods.push(meta);
                }
            }
        }
    }

    mods.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    mods
}

#[tauri::command]
pub fn sync_mods(selected_mods: Vec<String>) -> Result<(), String> {
    let mut cfg = read_config();

    let active_mods_path =
        find_active_mods_path(&cfg.exe_path).ok_or_else(|| "Invalid game path".to_string())?;

    if cfg.mods_storage_path.is_empty() {
        return Err("Invalid storage path".to_string());
    }
    let storage_path = Path::new(&cfg.mods_storage_path);

    let valid_ext = ["pak", "ucas", "utoc"];

    if active_mods_path.exists() {
        if let Ok(entries) = fs::read_dir(&active_mods_path) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_file() {
                    let ext = p
                        .extension()
                        .and_then(|e| e.to_str())
                        .unwrap_or("")
                        .to_lowercase();
                    if valid_ext.contains(&ext.as_str()) {
                        fs::remove_file(&p).ok();
                    }
                } else if p.is_dir() {
                    fs::remove_dir_all(&p).ok();
                }
            }
        }
    }

    for mod_name in &selected_mods {
        let mod_dir = storage_path.join(mod_name);
        if mod_dir.exists() {
            if let Ok(entries) = fs::read_dir(&mod_dir) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.is_file() {
                        let ext = p
                            .extension()
                            .and_then(|e| e.to_str())
                            .unwrap_or("")
                            .to_lowercase();
                        if valid_ext.contains(&ext.as_str()) {
                            let dest = active_mods_path.join(p.file_name().unwrap());
                            fs::copy(&p, &dest).map_err(|e| e.to_string())?;
                        }
                    }
                }
            }
        }
    }

    if let Ok(entries) = fs::read_dir(storage_path) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let json_path = path.join("mod.json");
                if json_path.exists() {
                    let folder = path
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("")
                        .to_string();
                    let is_enabled = selected_mods.contains(&folder);
                    if let Ok(data) = fs::read_to_string(&json_path) {
                        if let Ok(mut val) = serde_json::from_str::<serde_json::Value>(&data) {
                            val["enabled"] = serde_json::json!(is_enabled);
                            fs::write(
                                &json_path,
                                serde_json::to_string_pretty(&val).unwrap_or_default(),
                            )
                            .ok();
                        }
                    }
                }
            }
        }
    }

    cfg.active_mods = selected_mods;
    write_config(&cfg)
}

#[tauri::command]
pub fn install_mod(archive_path: String, mod_name: String, mod_type: String) -> Result<(), String> {
    let cfg = read_config();
    if cfg.mods_storage_path.is_empty() {
        return Err("No storage path configured".to_string());
    }

    let storage_path = Path::new(&cfg.mods_storage_path);
    let target_dir = storage_path.join(&mod_name);

    if target_dir.exists() {
        return Err("Mod already exists".to_string());
    }

    let temp_dir = storage_path.join("_temp_extract");
    if temp_dir.exists() {
        fs::remove_dir_all(&temp_dir).ok();
    }
    fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;

    let result = (|| -> Result<(), String> {
        let archive_lower = archive_path.to_lowercase();
        if archive_lower.ends_with(".zip") {
            let file = fs::File::open(&archive_path).map_err(|e| e.to_string())?;
            let mut zip = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
            zip.extract(&temp_dir).map_err(|e| e.to_string())?;
        } else {
            return Err("Only ZIP archives are supported in this version.".to_string());
        }

        let valid_ext = ["pak", "ucas", "utoc"];
        let mut found_files: Vec<PathBuf> = vec![];

        for entry in walkdir::WalkDir::new(&temp_dir).into_iter().flatten() {
            let p = entry.path().to_path_buf();
            if p.is_file() {
                let ext = p
                    .extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("")
                    .to_lowercase();
                if valid_ext.contains(&ext.as_str()) {
                    found_files.push(p);
                }
            }
        }

        if found_files.is_empty() {
            return Err("No valid files found".to_string());
        }

        fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;
        for f in &found_files {
            let dest = target_dir.join(f.file_name().unwrap());
            fs::copy(f, &dest).map_err(|e| e.to_string())?;
        }

        let metadata = serde_json::json!({ "name": mod_name, "type": mod_type, "enabled": false });
        fs::write(
            target_dir.join("mod.json"),
            serde_json::to_string_pretty(&metadata).unwrap(),
        )
        .map_err(|e| e.to_string())
    })();

    if temp_dir.exists() {
        fs::remove_dir_all(&temp_dir).ok();
    }

    result
}

#[tauri::command]
pub fn delete_mod(folder_name: String) -> Result<(), String> {
    let mut cfg = read_config();
    if cfg.mods_storage_path.is_empty() {
        return Ok(());
    }

    let mod_path = Path::new(&cfg.mods_storage_path).join(&folder_name);
    if mod_path.exists() {
        fs::remove_dir_all(&mod_path).map_err(|e| e.to_string())?;
    }

    cfg.active_mods.retain(|m| m != &folder_name);
    write_config(&cfg)
}

#[tauri::command]
pub fn rename_mod(old_name: String, new_name: String) -> Result<bool, String> {
    let mut cfg = read_config();
    if cfg.mods_storage_path.is_empty() {
        return Ok(false);
    }

    let storage = Path::new(&cfg.mods_storage_path);
    let old_path = storage.join(&old_name);
    let new_path = storage.join(&new_name);

    if old_path.exists() && !new_path.exists() {
        fs::rename(&old_path, &new_path).map_err(|e| e.to_string())?;

        let json_path = new_path.join("mod.json");
        if json_path.exists() {
            if let Ok(data) = fs::read_to_string(&json_path) {
                if let Ok(mut val) = serde_json::from_str::<serde_json::Value>(&data) {
                    val["name"] = serde_json::json!(new_name.clone());
                    fs::write(
                        &json_path,
                        serde_json::to_string_pretty(&val).unwrap_or_default(),
                    )
                    .ok();
                }
            }
        }

        if let Some(idx) = cfg.active_mods.iter().position(|m| m == &old_name) {
            cfg.active_mods[idx] = new_name;
        }
        write_config(&cfg)?;
        return Ok(true);
    }
    Ok(false)
}

#[tauri::command]
pub fn update_mod_metadata(
    mod_folder_name: String,
    key: String,
    value: serde_json::Value,
) -> Result<(), String> {
    let cfg = read_config();
    if cfg.mods_storage_path.is_empty() {
        return Ok(());
    }

    let json_path = Path::new(&cfg.mods_storage_path)
        .join(&mod_folder_name)
        .join("mod.json");

    if json_path.exists() {
        let data = fs::read_to_string(&json_path).map_err(|e| e.to_string())?;
        let mut val: serde_json::Value = serde_json::from_str(&data).map_err(|e| e.to_string())?;
        val[&key] = value;
        fs::write(
            &json_path,
            serde_json::to_string_pretty(&val).unwrap_or_default(),
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn check_for_migration() -> Option<Vec<String>> {
    let cfg = read_config();
    let active_mods_path = find_active_mods_path(&cfg.exe_path)?;

    if !active_mods_path.exists() {
        return None;
    }

    let valid_ext = ["pak", "ucas", "utoc"];
    let mut stems: HashMap<String, Vec<PathBuf>> = HashMap::new();

    if let Ok(entries) = fs::read_dir(&active_mods_path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file() {
                let ext = p
                    .extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("")
                    .to_lowercase();
                if valid_ext.contains(&ext.as_str()) {
                    let stem = p
                        .file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or("")
                        .to_string();
                    stems.entry(stem).or_default().push(p);
                }
            }
        }
    }

    if stems.is_empty() {
        None
    } else {
        Some(stems.into_keys().collect())
    }
}

#[tauri::command]
pub fn migrate_mods(mod_names: Vec<String>) -> Result<usize, String> {
    let cfg = read_config();
    if cfg.mods_storage_path.is_empty() {
        return Err("No storage path configured".to_string());
    }

    let active_mods_path =
        find_active_mods_path(&cfg.exe_path).ok_or_else(|| "Invalid game path".to_string())?;

    let storage_path = Path::new(&cfg.mods_storage_path);
    let valid_ext = ["pak", "ucas", "utoc"];
    let mut count = 0;

    for mod_name in &mod_names {
        let mut target_dir = storage_path.join(mod_name);
        let mut counter = 1;
        while target_dir.exists() {
            target_dir = storage_path.join(format!("{}_{}", mod_name, counter));
            counter += 1;
        }
        fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;

        if let Ok(entries) = fs::read_dir(&active_mods_path) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_file() {
                    let ext = p
                        .extension()
                        .and_then(|e| e.to_str())
                        .unwrap_or("")
                        .to_lowercase();
                    let stem = p
                        .file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or("")
                        .to_string();
                    if valid_ext.contains(&ext.as_str()) && &stem == mod_name {
                        let dest = target_dir.join(p.file_name().unwrap());
                        fs::rename(&p, &dest).map_err(|e| e.to_string())?;
                    }
                }
            }
        }
        count += 1;
    }

    Ok(count)
}

#[tauri::command]
#[allow(dead_code)]
pub fn export_mods(names: Vec<String>, path: String) -> Result<(), String> {
    let cfg = read_config();
    if cfg.mods_storage_path.is_empty() {
        return Err("No storage path configured".to_string());
    }
    let storage = Path::new(&cfg.mods_storage_path);

    let output = fs::File::create(&path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(output);
    let options: zip::write::FileOptions<()> =
        zip::write::FileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    for name in &names {
        let mod_dir = storage.join(name);
        if !mod_dir.exists() {
            continue;
        }

        for entry in walkdir::WalkDir::new(&mod_dir).into_iter().flatten() {
            let path = entry.path();
            if path.is_file() {
                let relative = path
                    .strip_prefix(storage)
                    .unwrap_or(path)
                    .to_str()
                    .unwrap_or("");

                zip.start_file(relative, options.clone())
                    .map_err(|e| e.to_string())?;
                let data = fs::read(path).map_err(|e| e.to_string())?;
                use std::io::Write;
                zip.write_all(&data).map_err(|e| e.to_string())?;
            }
        }
    }

    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
#[allow(dead_code)]
pub fn import_mod_from_folder(
    folder_path: String,
    mod_name: String,
    mod_type: String,
) -> Result<(), String> {
    let cfg = read_config();
    if cfg.mods_storage_path.is_empty() {
        return Err("No storage path configured".to_string());
    }

    let source = Path::new(&folder_path);
    if !source.exists() || !source.is_dir() {
        return Err("Source folder does not exist".to_string());
    }

    let storage_path = Path::new(&cfg.mods_storage_path);
    let target_dir = storage_path.join(&mod_name);

    if target_dir.exists() {
        return Err("Mod already exists".to_string());
    }

    fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;

    let valid_ext = ["pak", "ucas", "utoc", "json"];
    for entry in walkdir::WalkDir::new(source).into_iter().flatten() {
        let p = entry.path();
        if p.is_file() {
            let ext = p
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();
            if valid_ext.contains(&ext.as_str()) {
                let dest = target_dir.join(p.file_name().unwrap());
                fs::copy(p, &dest).map_err(|e| e.to_string())?;
            }
        }
    }

    let metadata = serde_json::json!({ "name": mod_name, "type": mod_type, "enabled": false });
    fs::write(
        target_dir.join("mod.json"),
        serde_json::to_string_pretty(&metadata).unwrap(),
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn launch_game() -> Result<(), String> {
    let cfg = read_config();
    if !cfg.steam_appid.is_empty() {
        let url = format!("steam://run/{}", cfg.steam_appid);
        open::that(&url).map_err(|e| e.to_string())?;
    } else if !cfg.exe_path.is_empty() && Path::new(&cfg.exe_path).exists() {
        std::process::Command::new(&cfg.exe_path)
            .spawn()
            .map_err(|e| e.to_string())?;
    } else {
        return Err("No game configured".to_string());
    }
    Ok(())
}
