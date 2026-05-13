use crate::utils::{rand_u64, safe_folder_name, unique_dest};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SongMeta {
    #[serde(default = "default_version")]
    pub version: i32,
    #[serde(default)]
    pub unique_id: i64,
    #[serde(default = "default_song_name")]
    pub song_name: String,
    #[serde(default)]
    pub performed_by: serde_json::Value,
    #[serde(default)]
    pub written_by: Vec<String>,
    #[serde(default)]
    pub seed: i64,
    #[serde(default = "default_tempo")]
    pub tempo: f64,
    #[serde(default)]
    pub custom_tempo_sections: Vec<serde_json::Value>,
    #[serde(default)]
    pub beat_offset: i64,
    #[serde(default)]
    pub start_song_offset: f64,
    #[serde(default)]
    pub end_song_offset: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub discomaps_id: Option<String>,
    #[serde(default)]
    pub created_at: i64,
}

fn default_version() -> i32 {
    1
}
fn default_song_name() -> String {
    "Unknown Song".to_string()
}
fn default_tempo() -> f64 {
    120.0
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Song {
    pub folder_path: String,
    pub song_name: String,
    pub performed_by: serde_json::Value,
    pub tempo: f64,
    pub beat_offset: i64,
    pub start_song_offset: f64,
    pub end_song_offset: f64,
    pub unique_id: i64,
    pub seed: i64,
    pub created_at: i64,
    pub full_metadata: serde_json::Value,
}

fn imported_songs_dir() -> PathBuf {
    let local = std::env::var("LOCALAPPDATA").unwrap_or_else(|_| String::new());
    PathBuf::from(local)
        .join("Pagoda")
        .join("Saved")
        .join("ImportedSongs")
}

fn read_meta(folder: &Path) -> Option<(SongMeta, serde_json::Value)> {
    let meta_path = folder.join("Meta.json");
    let audio_path = folder.join("Audio.ogg");
    if !meta_path.exists() || !audio_path.exists() {
        return None;
    }

    let raw = fs::read(&meta_path).ok()?;
    let text = String::from_utf8(raw.clone())
        .or_else(|_| {
            if raw.starts_with(&[0xFF, 0xFE]) || raw.starts_with(&[0xFE, 0xFF]) {
                let (_, body, _) = unsafe { raw.align_to::<u16>() };
                Ok(String::from_utf16_lossy(body))
            } else {
                Err(std::string::FromUtf8Error::from(
                    String::from_utf8(raw).unwrap_err(),
                ))
            }
        })
        .ok()?;

    let json: serde_json::Value = serde_json::from_str(&text).ok()?;
    let meta: SongMeta = serde_json::from_value(json.clone()).ok()?;
    Some((meta, json))
}

fn song_from_folder(folder: &Path) -> Option<Song> {
    let (meta, full) = read_meta(folder)?;
    let mut created_at = meta.created_at;
    if created_at == 0 {
        if let Ok(fs_meta) = fs::metadata(folder) {
            if let Ok(created) = fs_meta.created() {
                if let Ok(duration) = created.duration_since(std::time::UNIX_EPOCH) {
                    created_at = duration.as_secs() as i64;
                }
            } else if let Ok(modified) = fs_meta.modified() {
                if let Ok(duration) = modified.duration_since(std::time::UNIX_EPOCH) {
                    created_at = duration.as_secs() as i64;
                }
            }
        }
    }

    Some(Song {
        folder_path: folder.to_string_lossy().to_string(),
        song_name: meta.song_name.clone(),
        performed_by: meta.performed_by.clone(),
        tempo: meta.tempo,
        beat_offset: meta.beat_offset,
        start_song_offset: meta.start_song_offset,
        end_song_offset: meta.end_song_offset,
        unique_id: meta.unique_id,
        seed: meta.seed,
        created_at,
        full_metadata: full,
    })
}

#[tauri::command]
pub fn scan_songs() -> Vec<Song> {
    let base = imported_songs_dir();
    fs::create_dir_all(&base).ok();

    let mut songs: Vec<Song> = vec![];
    if let Ok(entries) = fs::read_dir(&base) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if let Some(song) = song_from_folder(&path) {
                    songs.push(song);
                }
            }
        }
    }

    songs.sort_by(|a, b| a.song_name.to_lowercase().cmp(&b.song_name.to_lowercase()));
    songs
}

#[tauri::command]
pub fn delete_song(folder_path: String) -> Result<(), String> {
    let p = Path::new(&folder_path);
    if p.exists() {
        fs::remove_dir_all(p).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn update_song_metadata(
    folder_path: String,
    metadata: serde_json::Value,
) -> Result<Vec<String>, String> {
    let meta_path = Path::new(&folder_path).join("Meta.json");
    if !meta_path.exists() {
        return Err("Meta.json not found".to_string());
    }

    let mut errors: Vec<String> = vec![];
    if metadata["tempo"].as_f64().is_none() {
        errors.push("Invalid tempo".to_string());
    }

    if !errors.is_empty() {
        return Ok(errors);
    }

    let raw = fs::read_to_string(&meta_path).map_err(|e| e.to_string())?;
    let mut existing: serde_json::Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;

    if let Some(obj) = metadata.as_object() {
        for (k, v) in obj {
            existing[k] = v.clone();
        }
    }

    let json_str = serde_json::to_string_pretty(&existing).map_err(|e| e.to_string())?;
    fs::write(&meta_path, json_str).map_err(|e| e.to_string())?;
    Ok(vec![])
}

#[tauri::command]
pub fn import_song(
    app: tauri::AppHandle,
    path: String,
    custom_metadata: Option<serde_json::Value>,
) -> Result<String, String> {
    let p = Path::new(&path);
    let base = imported_songs_dir();
    fs::create_dir_all(&base).ok();

    if p.is_dir() {
        return import_folder(app, p, &base, custom_metadata);
    }

    let lower = path.to_lowercase();
    if lower.ends_with(".zip") {
        return import_zip(app, p, &base);
    }

    if lower.ends_with(".ogg") || lower.ends_with(".mp3") || lower.ends_with(".wav") {
        return import_audio_file(app, p, &base, custom_metadata);
    }

    Err("Unsupported file format".to_string())
}

fn is_valid_song_folder(folder: &Path) -> bool {
    folder.join("Meta.json").exists() && folder.join("Audio.ogg").exists()
}

fn copy_song_folder(
    source: &Path,
    base_dir: &Path,
    existing_ids: &HashSet<(i64, i64)>,
) -> Result<Option<String>, String> {
    let meta_path = source.join("Meta.json");
    if meta_path.exists() {
        if let Ok(data) = fs::read_to_string(&meta_path) {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&data) {
                let uid = val["uniqueId"].as_i64().unwrap_or(0);
                let seed = val["seed"].as_i64().unwrap_or(0);
                if existing_ids.contains(&(uid, seed)) {
                    return Ok(None);
                }
            }
        }
    }

    let folder_name = source
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("song")
        .to_string();
    let dest = base_dir.join(&folder_name);
    if dest.exists() {
        return Err(format!("Folder '{}' already exists", folder_name));
    }

    copy_dir_all(source, &dest)?;
    Ok(Some(folder_name))
}

fn copy_dir_all(src: &Path, dst: &Path) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(src).map_err(|e| e.to_string())?.flatten() {
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_all(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn import_folder(
    app: tauri::AppHandle,
    folder: &Path,
    base: &Path,
    custom_metadata: Option<serde_json::Value>,
) -> Result<String, String> {
    if is_valid_song_folder(folder) {
        let existing_ids = collect_existing_ids(base);
        match copy_song_folder(folder, base, &existing_ids)? {
            Some(name) => return Ok(format!("Imported '{}'", name)),
            None => return Ok("Duplicate song skipped".to_string()),
        }
    }

    let mut count = 0;
    if let Ok(entries) = fs::read_dir(folder) {
        let existing_ids = collect_existing_ids(base);
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() && is_valid_song_folder(&path) {
                copy_song_folder(&path, base, &existing_ids).ok();
                count += 1;
            }
        }
    }

    if count > 0 {
        return Ok(format!("Imported {} songs", count));
    }

    for entry in walkdir::WalkDir::new(folder).into_iter().flatten() {
        let p = entry.path().to_path_buf();
        if p.is_file() {
            let ext = p
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();
            if ["ogg", "mp3", "wav"].contains(&ext.as_str()) {
                import_audio_file(app.clone(), &p, base, custom_metadata.clone()).ok();
                count += 1;
            }
        }
    }

    if count > 0 {
        Ok(format!("Imported {} audio files", count))
    } else {
        Err("No valid songs or audio files found".to_string())
    }
}

fn import_zip(app: tauri::AppHandle, zip_path: &Path, base: &Path) -> Result<String, String> {
    let temp_dir = std::env::temp_dir().join("discomod_song_import");
    fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;

    let file = fs::File::open(zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    archive.extract(&temp_dir).map_err(|e| e.to_string())?;

    let result = import_folder(app, &temp_dir, base, None);
    fs::remove_dir_all(&temp_dir).ok();
    result
}

fn import_audio_file(
    app: tauri::AppHandle,
    audio_path: &Path,
    base: &Path,
    custom_metadata: Option<serde_json::Value>,
) -> Result<String, String> {
    let song_name = audio_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("imported_song")
        .to_string();

    let safe_name: String = song_name
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect::<String>()
        .trim_matches('_')
        .to_string();

    let safe_name = if safe_name.is_empty() {
        "imported_song".to_string()
    } else {
        safe_name
    };

    let dest_folder = unique_dest(base, &safe_name);
    fs::create_dir_all(&dest_folder).map_err(|e| e.to_string())?;

    let target_audio = dest_folder.join("Audio.ogg");

    use tauri_plugin_shell::ShellExt;
    if let Ok(sidecar_command) = app.shell().sidecar("ffmpeg") {
        let output = tauri::async_runtime::block_on(async move {
            sidecar_command
                .args([
                    "-i",
                    audio_path.to_str().unwrap_or(""),
                    "-c:a",
                    "libvorbis",
                    "-q:a",
                    "6",
                    "-y",
                    target_audio.to_str().unwrap_or(""),
                ])
                .output()
                .await
        })
        .map_err(|e| e.to_string())?;

        if !output.status.success() {
            fs::remove_dir_all(&dest_folder).ok();
            return Err("Audio conversion failed".to_string());
        }
    } else {
        let ext = audio_path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        if ext == "ogg" {
            fs::copy(audio_path, &target_audio).map_err(|e| e.to_string())?;
        } else {
            fs::remove_dir_all(&dest_folder).ok();
            return Err("FFmpeg sidecar not found and file is not an ogg.".to_string());
        }
    }

    let uid = (rand_u64() % u32::MAX as u64) as i64;
    let seed = (rand_u64() % u32::MAX as u64) as i64;

    let meta = if let Some(custom) = custom_metadata {
        let mut m = custom;
        m["uniqueId"] = serde_json::json!(uid);
        m["seed"] = serde_json::json!(seed);
        m["version"] = serde_json::json!(1);
        m
    } else {
        serde_json::json!({
            "version": 1,
            "uniqueId": uid,
            "songName": song_name,
            "performedBy": ["Unknown Artist"],
            "writtenBy": [],
            "seed": seed,
            "tempo": 120.0,
            "customTempoSections": [],
            "beatOffset": 0,
            "startSongOffset": 0.0,
            "endSongOffset": 0.0,
        })
    };

    let meta_path = dest_folder.join("Meta.json");
    fs::write(
        &meta_path,
        serde_json::to_string_pretty(&meta).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;

    Ok(format!("Imported '{}' successfully.", song_name))
}

fn collect_existing_ids(base: &Path) -> HashSet<(i64, i64)> {
    let mut ids = HashSet::new();
    if let Ok(entries) = fs::read_dir(base) {
        for entry in entries.flatten() {
            let meta_path = entry.path().join("Meta.json");
            if let Ok(data) = fs::read_to_string(&meta_path) {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&data) {
                    if let (Some(uid), Some(seed)) =
                        (val["uniqueId"].as_i64(), val["seed"].as_i64())
                    {
                        ids.insert((uid, seed));
                    }
                }
            }
        }
    }
    ids
}

#[tauri::command]
pub fn export_songs(paths: Vec<String>, path: String) -> Result<(), String> {
    let output = fs::File::create(&path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(output);
    let options: zip::write::FileOptions<()> =
        zip::write::FileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    for folder_path in &paths {
        let folder = Path::new(folder_path);
        let _folder_name = folder
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("song");

        for entry in walkdir::WalkDir::new(folder).into_iter().flatten() {
            let path = entry.path();
            if path.is_file() {
                let relative = path
                    .strip_prefix(folder.parent().unwrap_or(folder))
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
pub fn import_shared_package(
    zip_path: String,
    strategies: std::collections::HashMap<String, String>,
) -> Result<String, String> {
    let base = imported_songs_dir();
    let temp_dir = std::env::temp_dir().join("discomod_shared_import");
    fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;

    let file = fs::File::open(&zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    archive.extract(&temp_dir).map_err(|e| e.to_string())?;

    let mut count = 0;
    if let Ok(entries) = fs::read_dir(&temp_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() && is_valid_song_folder(&path) {
                let folder_name = path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("")
                    .to_string();
                let strategy = strategies
                    .get(&folder_name)
                    .map(|s| s.as_str())
                    .unwrap_or("new");

                match strategy {
                    "replace" => {
                        let dest = base.join(&folder_name);
                        if dest.exists() {
                            fs::remove_dir_all(&dest).ok();
                        }
                        copy_dir_all(&path, &dest)?;
                        count += 1;
                    }
                    "skip" => {}
                    _ => {
                        let dest = unique_dest(&base, &folder_name);
                        copy_dir_all(&path, &dest)?;

                        let meta_path = dest.join("Meta.json");
                        if let Ok(data) = fs::read_to_string(&meta_path) {
                            if let Ok(mut val) = serde_json::from_str::<serde_json::Value>(&data) {
                                val["uniqueId"] =
                                    serde_json::json!((rand_u64() % u32::MAX as u64) as i64);
                                val["seed"] =
                                    serde_json::json!((rand_u64() % u32::MAX as u64) as i64);
                                fs::write(
                                    &meta_path,
                                    serde_json::to_string_pretty(&val).unwrap_or_default(),
                                )
                                .ok();
                            }
                        }
                        count += 1;
                    }
                }
            }
        }
    }

    fs::remove_dir_all(&temp_dir).ok();
    Ok(format!("Imported {} songs.", count))
}

const BEATMAP_CACHE_URL: &str = "https://cdn.discomaps.com/caches/beatmap_cache.json";
const CDN_BASE: &str = "https://cdn.discomaps.com/beatmaps";

#[tauri::command]
pub async fn fetch_song_catalogue(api_key: String) -> Result<Vec<serde_json::Value>, String> {
    if api_key.trim().is_empty() {
        return Err("API key required".to_string());
    }

    let client = reqwest::Client::new();
    let resp = client
        .get(BEATMAP_CACHE_URL)
        .header("User-Agent", "DiscoMod/1.0")
        .header("x-api-key", api_key.trim())
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!(
            "HTTP {}: {}",
            resp.status().as_u16(),
            resp.status().canonical_reason().unwrap_or("")
        ));
    }

    let data: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let maps = data["all_maps"].as_array().cloned().unwrap_or_default();

    Ok(maps)
}

#[tauri::command]
pub async fn download_song(
    map_entry: serde_json::Value,
    api_key: String,
) -> Result<String, String> {
    if api_key.trim().is_empty() {
        return Err("API key required".to_string());
    }

    let base = imported_songs_dir();
    fs::create_dir_all(&base).ok();

    let map_id = map_entry["id"].as_str().unwrap_or("").to_string();
    let title = map_entry["t"].as_str().unwrap_or("Unknown").to_string();
    let artist = map_entry["a"]
        .as_str()
        .unwrap_or("Unknown Artist")
        .to_string();
    let bpm = map_entry["b"].as_f64().unwrap_or(120.0);

    if map_id.is_empty() {
        return Err("Invalid map entry: missing id".to_string());
    }

    if let Ok(entries) = fs::read_dir(&base) {
        for entry in entries.flatten() {
            let meta_path = entry.path().join("Meta.json");
            if let Ok(data) = fs::read_to_string(&meta_path) {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&data) {
                    if val["discomapsId"].as_str() == Some(&map_id) {
                        return Ok(format!("'{}' is already downloaded.", title));
                    }

                    let s_title = val["songName"].as_str().unwrap_or("");
                    let s_artist_val = &val["performedBy"];

                    let artist_matches = if let Some(arr) = s_artist_val.as_array() {
                        arr.iter().any(|v| v.as_str() == Some(&artist))
                    } else {
                        s_artist_val.as_str() == Some(&artist)
                    };

                    if s_title == title && artist_matches {
                        return Ok(format!("'{}' is already installed.", title));
                    }
                }
            }
        }
    }

    let folder_name = safe_folder_name(&format!("{} - {}", artist, title));
    let dest_folder = unique_dest(&base, &folder_name);
    fs::create_dir_all(&dest_folder).map_err(|e| e.to_string())?;

    let client = reqwest::Client::new();
    let headers_fn = |c: &reqwest::Client, url: &str| {
        c.get(url)
            .header("User-Agent", "DiscoMod/1.0")
            .header("x-api-key", api_key.trim())
    };

    let audio_url = format!("{}/{}/Audio.ogg", CDN_BASE, map_id);
    let audio_resp = headers_fn(&client, &audio_url).send().await.map_err(|e| {
        fs::remove_dir_all(&dest_folder).ok();
        e.to_string()
    })?;

    if !audio_resp.status().is_success() {
        fs::remove_dir_all(&dest_folder).ok();
        return Err(format!(
            "Audio download failed: HTTP {}",
            audio_resp.status().as_u16()
        ));
    }

    let audio_bytes = audio_resp.bytes().await.map_err(|e| e.to_string())?;
    fs::write(dest_folder.join("Audio.ogg"), &audio_bytes).map_err(|e| e.to_string())?;

    let meta_url = format!("{}/{}/Meta.json", CDN_BASE, map_id);
    let meta_resp = headers_fn(&client, &meta_url)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let mut remote_meta: serde_json::Value = serde_json::json!({});
    if meta_resp.status().is_success() {
        if let Ok(m) = meta_resp.json::<serde_json::Value>().await {
            remote_meta = m;
        }
    }

    let uid = remote_meta["uniqueId"]
        .as_i64()
        .unwrap_or_else(|| (rand_u64() % u32::MAX as u64) as i64);
    let seed = remote_meta["seed"]
        .as_i64()
        .unwrap_or_else(|| (rand_u64() % u32::MAX as u64) as i64);

    let performed_by = remote_meta["performedBy"].clone();
    let performed_by = if performed_by.is_null()
        || performed_by
            .as_array()
            .map(|a| a.is_empty())
            .unwrap_or(true)
    {
        serde_json::json!([artist])
    } else {
        performed_by
    };

    let local_meta = serde_json::json!({
        "version": remote_meta["version"].as_i64().unwrap_or(1),
        "uniqueId": uid,
        "songName": remote_meta["songName"].as_str().unwrap_or(&title),
        "performedBy": performed_by,
        "writtenBy": remote_meta["writtenBy"].as_array().cloned().unwrap_or_default(),
        "seed": seed,
        "tempo": remote_meta["tempo"].as_f64().unwrap_or(bpm),
        "customTempoSections": remote_meta["customTempoSections"].as_array().cloned().unwrap_or_default(),
        "beatOffset": remote_meta["beatOffset"].as_i64().unwrap_or(0),
        "startSongOffset": remote_meta["startSongOffset"].as_f64().unwrap_or(0.0),
        "endSongOffset": remote_meta["endSongOffset"].as_f64().unwrap_or(0.0),
        "discomapsId": map_id,
    });

    fs::write(
        dest_folder.join("Meta.json"),
        serde_json::to_string_pretty(&local_meta).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;

    Ok(format!("Downloaded '{}' by {}.", title, artist))
}
