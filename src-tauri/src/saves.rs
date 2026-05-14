use crate::utils::config_dir;
use chrono::Local;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveFile {
    pub name: String,
    pub path: String,
    pub last_modified: i64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupFile {
    pub name: String,
    pub path: String,
    pub date: String,
    pub original_name: String,
}

fn get_game_saves_dir() -> PathBuf {
    if let Some(local_app_data) = dirs::data_local_dir() {
        return local_app_data
            .join("Pagoda")
            .join("Saved")
            .join("SaveGames");
    }
    PathBuf::new()
}

fn get_app_saves_dir() -> PathBuf {
    let dir = config_dir().join("saves");
    if !dir.exists() {
        let _ = fs::create_dir_all(&dir);
    }
    dir
}

#[tauri::command]
pub fn list_game_saves() -> Result<Vec<SaveFile>, String> {
    let dir = get_game_saves_dir();
    if !dir.exists() {
        return Ok(vec![]);
    }

    let mut saves = vec![];
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                let name = path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("")
                    .to_string();
                
                
                if name == "steam_autocloud.vdf" || !name.ends_with(".sav") {
                    continue;
                }

                let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;
                let last_modified = metadata
                    .modified()
                    .map(|m| {
                        m.duration_since(std::time::UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_secs() as i64
                    })
                    .unwrap_or(0);

                saves.push(SaveFile {
                    name,
                    path: path.to_string_lossy().to_string(),
                    last_modified,
                });
            }
        }
    }

    saves.sort_by(|a, b| b.last_modified.cmp(&a.last_modified));
    Ok(saves)
}

#[tauri::command]
pub fn backup_save(path: String) -> Result<(), String> {
    let source = Path::new(&path);
    if !source.exists() {
        return Err("Source save file does not exist".to_string());
    }

    let filename = source
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("Invalid filename")?;
    let now = Local::now();
    let timestamp = now.format("%Y-%m-%d-%H-%M-%S").to_string();
    let backup_name = format!("{}_{}.bak", timestamp, filename);

    let dest_dir = get_app_saves_dir();
    let dest = dest_dir.join(&backup_name);

    fs::copy(source, dest).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn list_backups() -> Result<Vec<BackupFile>, String> {
    let dir = get_app_saves_dir();
    let mut backups = vec![];

    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("bak") {
                let name = path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("")
                    .to_string();

                let (date_part, original_name) = if let Some(idx) = name.find('_') {
                    (&name[0..idx], &name[idx + 1..])
                } else {
                    ("", name.as_str())
                };

                let display_date = if date_part.len() >= 19 {
                    format!(
                        "{} {}:{}:{}",
                        &date_part[0..10],
                        &date_part[11..13],
                        &date_part[14..16],
                        &date_part[17..19]
                    )
                } else {
                    date_part.to_string()
                };

                let original_name_owned = original_name.to_string();

                backups.push(BackupFile {
                    name,
                    path: path.to_string_lossy().to_string(),
                    date: display_date,
                    original_name: original_name_owned,
                });
            }
        }
    }

    backups.sort_by(|a, b| b.name.cmp(&a.name));
    Ok(backups)
}

#[tauri::command]
pub fn restore_save(backup_path: String) -> Result<(), String> {
    let source = Path::new(&backup_path);
    if !source.exists() {
        return Err("Backup file does not exist".to_string());
    }

    let filename = source
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("Invalid filename")?;

    let original_name = if let Some(idx) = filename.find('_') {
        &filename[idx + 1..]
    } else {
        filename
    };

    let original_name = original_name.strip_suffix(".bak").unwrap_or(original_name);

    let dest_dir = get_game_saves_dir();
    let dest = dest_dir.join(original_name);

    if !dest_dir.exists() {
        let _ = fs::create_dir_all(&dest_dir);
    }

    fs::copy(source, dest).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_backup(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.exists() {
        fs::remove_file(p).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn open_saves_dir() -> Result<(), String> {
    let dir = get_game_saves_dir();
    if !dir.exists() {
        let _ = fs::create_dir_all(&dir);
    }
    open::that(dir).map_err(|e| e.to_string())
}

fn backup_all_active_saves() -> Result<(), String> {
    let game_dir = get_game_saves_dir();
    if !game_dir.exists() {
        return Ok(());
    }

    if let Ok(entries) = fs::read_dir(game_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                let filename = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                
                if filename.len() > 20 && filename.chars().take(10).all(|c| c.is_numeric() || c == '-') {
                    continue;
                }
                if filename.ends_with(".bak") {
                    continue;
                }

                
                let _ = backup_save(path.to_string_lossy().to_string());
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn import_save(path: String) -> Result<String, String> {
    let source = Path::new(&path);
    if !source.exists() {
        return Err("Source file does not exist".to_string());
    }

    
    let _ = backup_all_active_saves();

    let original_name = source
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("Invalid filename")?;
    
    let now = Local::now();
    let timestamp = now.format("%Y-%m-%d-%H-%M-%S").to_string();
    let new_name = format!("{}-{}", timestamp, original_name);
    
    let dest_dir = get_game_saves_dir();
    if !dest_dir.exists() {
        fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;
    }
    
    let dest = dest_dir.join(&new_name);
    fs::copy(source, dest).map_err(|e| e.to_string())?;
    
    Ok(new_name)
}
#[tauri::command]
pub fn read_save_data(path: String) -> Result<serde_json::Value, String> {
    let mut file = fs::File::open(&path).map_err(|e| e.to_string())?;
    let save = uesave::Save::read(&mut file).map_err(|e| e.to_string())?;
    
    
    let mut map = serde_json::Map::new();
    for (name, property) in &save.root.properties {
        let key = format!("{}_{}", name.1, name.0);
        let val = serde_json::to_value(property).map_err(|e| e.to_string())?;
        map.insert(key, val);
    }
    
    Ok(serde_json::Value::Object(map))
}

fn update_property_from_json(prop: &mut uesave::Property, val: &serde_json::Value) {
    
    let actual_val = if let Some(obj) = val.as_object() {
        if obj.len() == 1 {
            obj.values().next().unwrap()
        } else {
            val
        }
    } else {
        val
    };

    match prop {
        uesave::Property::Int(ref mut v) => { if let Some(n) = actual_val.as_i64() { *v = n as i32; } }
        uesave::Property::Int64(ref mut v) => { if let Some(n) = actual_val.as_i64() { *v = n; } }
        uesave::Property::UInt32(ref mut v) => { if let Some(n) = actual_val.as_u64() { *v = n as u32; } }
        uesave::Property::Float(ref mut v) => { if let Some(n) = actual_val.as_f64() { v.0 = n as f32; } }
        uesave::Property::Double(ref mut v) => { if let Some(n) = actual_val.as_f64() { v.0 = n; } }
        uesave::Property::Bool(ref mut v) => { if let Some(b) = actual_val.as_bool() { *v = b; } }
        uesave::Property::Str(ref mut v) | uesave::Property::Name(ref mut v) => { if let Some(s) = actual_val.as_str() { *v = s.to_string(); } }
        uesave::Property::Struct(s) => {
            if let uesave::StructValue::Struct(props) = s {
                if let Some(obj) = actual_val.as_object() {
                    for (k, v) in obj {
                        let (name, index_str) = k.rsplit_once('_').unwrap_or((k, "0"));
                        let index = index_str.parse().unwrap_or(0);
                        let key = uesave::PropertyKey(index, name.to_string());
                        if let Some(p) = props.0.get_mut(&key) {
                            update_property_from_json(p, v);
                        }
                    }
                }
            }
        }
        uesave::Property::Array(a) => {
            if let Some(arr) = actual_val.as_array() {
                match a {
                    uesave::ValueVec::Int(v) => {
                        *v = arr.iter().filter_map(|x| x.as_i64().map(|n| n as i32)).collect::<Vec<_>>();
                    }
                    uesave::ValueVec::Float(v) => {
                        *v = arr.iter().filter_map(|x| x.as_f64().map(|n| uesave::Float(n as f32))).collect::<Vec<_>>();
                    }
                    uesave::ValueVec::Double(v) => {
                        *v = arr.iter().filter_map(|x| x.as_f64().map(|n| uesave::Double(n))).collect::<Vec<_>>();
                    }
                    uesave::ValueVec::Bool(v) => {
                        *v = arr.iter().filter_map(|x| x.as_bool()).collect::<Vec<_>>();
                    }
                    uesave::ValueVec::Str(v) | uesave::ValueVec::Name(v) => {
                        *v = arr.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect::<Vec<_>>();
                    }
                    _ => {}
                }
            }
        }
        _ => {}
    }
}

#[tauri::command]
pub fn write_save_data(path: String, updates: serde_json::Value) -> Result<(), String> {
    let mut file = fs::File::open(&path).map_err(|e| e.to_string())?;
    let mut save = uesave::Save::read(&mut file).map_err(|e| e.to_string())?;
    
    if let Some(obj) = updates.as_object() {
        for (key_str, val_json) in obj {
            
            let (name_part, index_part) = key_str.rsplit_once('_').ok_or("Invalid key format")?;
            let index = index_part.parse::<u32>().map_err(|e| e.to_string())?;
            let key = uesave::PropertyKey(index, name_part.to_string());

            if let Some(prop) = save.root.properties.0.get_mut(&key) {
                update_property_from_json(prop, val_json);
            }
        }
    }
    
    let mut writer = fs::File::create(&path).map_err(|e| e.to_string())?;
    save.write(&mut writer).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
pub fn export_saves(save_paths: Vec<String>, output_path: String) -> Result<(), String> {
    let file = fs::File::create(&output_path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    let options: zip::write::SimpleFileOptions =
        zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    for path_str in save_paths {
        let path = Path::new(&path_str);
        if path.is_file() {
            let filename = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("save.sav");

            zip.start_file(filename, options).map_err(|e| e.to_string())?;
            let data = fs::read(path).map_err(|e| e.to_string())?;
            use std::io::Write;
            zip.write_all(&data).map_err(|e| e.to_string())?;
        }
    }

    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}
