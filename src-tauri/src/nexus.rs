use crate::utils::{safe_folder_name, unique_dest};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::command;

#[derive(Debug, Serialize, Deserialize)]
pub struct NexusMod {
    pub mod_id: u32,
    pub name: String,
    pub summary: String,
    pub version: String,
    pub author: String,
    pub picture_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NexusFile {
    pub file_id: u32,
    pub name: String,
    pub version: String,
    pub size_kb: u64,
}

const NEXUS_BASE_URL: &str = "https://api.nexusmods.com/v1";
const GAME_DOMAIN: &str = "deadasdisco";

#[command]
pub async fn fetch_nexus_mods(api_key: String, query: String) -> Result<Vec<NexusMod>, String> {
    if api_key.trim().is_empty() {
        return Err("Nexus API key required".to_string());
    }

    let client = reqwest::Client::new();

    let endpoints = ["latest_added", "trending"];
    let mut all_mods = Vec::new();
    let mut seen_ids = std::collections::HashSet::new();

    for endpoint in endpoints {
        let url = format!(
            "{}/games/{}/mods/{}.json",
            NEXUS_BASE_URL, GAME_DOMAIN, endpoint
        );
        let resp = client
            .get(&url)
            .header("User-Agent", "DiscoMod/1.0")
            .header("Accept", "application/json")
            .header("apikey", api_key.trim())
            .header("X-NexusMods-API-Key", api_key.trim())
            .send()
            .await;

        if let Ok(response) = resp {
            if response.status().is_success() {
                if let Ok(mods_data) = response.json::<serde_json::Value>().await {
                    if let Some(mods_array) = mods_data.as_array() {
                        for m in mods_array {
                            let mod_id = m["mod_id"].as_u64().unwrap_or(0) as u32;
                            if seen_ids.insert(mod_id) {
                                let name = m["name"].as_str().unwrap_or("Unknown").to_string();
                                let summary = m["summary"].as_str().unwrap_or("").to_string();

                                if query.is_empty()
                                    || name.to_lowercase().contains(&query.to_lowercase())
                                    || summary.to_lowercase().contains(&query.to_lowercase())
                                {
                                    all_mods.push(NexusMod {
                                        mod_id,
                                        name,
                                        summary,
                                        version: m["version"]
                                            .as_str()
                                            .unwrap_or("1.0.0")
                                            .to_string(),
                                        author: m["author"]
                                            .as_str()
                                            .unwrap_or("Unknown")
                                            .to_string(),
                                        picture_url: m["picture_url"]
                                            .as_str()
                                            .map(|s| s.to_string()),
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(all_mods)
}

#[command]
pub async fn download_nexus_mod(
    api_key: String,
    mod_id: u32,
    storage_path: String,
) -> Result<String, String> {
    if api_key.trim().is_empty() {
        return Err("Nexus API key required".to_string());
    }

    let client = reqwest::Client::new();

    let files_url = format!(
        "{}/games/{}/mods/{}/files.json",
        NEXUS_BASE_URL, GAME_DOMAIN, mod_id
    );
    let files_resp = client
        .get(&files_url)
        .header("User-Agent", "DiscoMod/1.0")
        .header("Accept", "application/json")
        .header("apikey", api_key.trim())
        .header("X-NexusMods-API-Key", api_key.trim())
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let files_data: serde_json::Value = files_resp.json().await.map_err(|e| e.to_string())?;
    let files = files_data["files"]
        .as_array()
        .ok_or("No files found for this mod")?;

    let main_file = files
        .iter()
        .find(|f| f["category_id"].as_u64() == Some(1))
        .or_else(|| files.get(0))
        .ok_or("No files available for this mod")?;

    let file_id = main_file["file_id"].as_u64().ok_or("Invalid file ID")?;
    let file_name = main_file["name"].as_str().unwrap_or("mod_archive");

    let dl_url = format!(
        "{}/games/{}/mods/{}/files/{}/download_link.json",
        NEXUS_BASE_URL, GAME_DOMAIN, mod_id, file_id
    );
    let dl_resp = client
        .get(&dl_url)
        .header("User-Agent", "DiscoMod/1.0")
        .header("Accept", "application/json")
        .header("apikey", api_key.trim())
        .header("X-NexusMods-API-Key", api_key.trim())
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if dl_resp.status().as_u16() == 403 {
        return Err("PREMIUM_REQUIRED".to_string());
    }

    if !dl_resp.status().is_success() {
        return Err(format!(
            "Nexus Download Error: HTTP {} - {}",
            dl_resp.status().as_u16(),
            dl_url
        ));
    }

    let dl_data: serde_json::Value = dl_resp.json().await.map_err(|e| e.to_string())?;
    let download_link = dl_data
        .as_array()
        .and_then(|a| a.get(0))
        .and_then(|o| o["URI"].as_str())
        .ok_or_else(|| format!("Failed to get download link from response: {:?}", dl_data))?;

    let download_resp = client
        .get(download_link)
        .header("User-Agent", "DiscoMod/1.0")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let bytes = download_resp.bytes().await.map_err(|e| e.to_string())?;

    let base = PathBuf::from(&storage_path);
    if !base.exists() {
        return Err("Storage path does not exist".to_string());
    }

    let folder_name = safe_folder_name(file_name);
    let dest_folder = unique_dest(&base, &folder_name);
    fs::create_dir_all(&dest_folder).map_err(|e| e.to_string())?;

    let cursor = std::io::Cursor::new(bytes);
    let mut archive = zip::ZipArchive::new(cursor).map_err(|e| e.to_string())?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let outpath = match file.enclosed_name() {
            Some(path) => dest_folder.join(path),
            None => continue,
        };

        if file.name().ends_with('/') {
            fs::create_dir_all(&outpath).ok();
        } else {
            if let Some(p) = outpath.parent() {
                if !p.exists() {
                    fs::create_dir_all(&p).ok();
                }
            }
            let mut outfile = fs::File::create(&outpath).map_err(|e| e.to_string())?;
            std::io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
        }
    }

    Ok(format!("Successfully installed Nexus mod: {}", file_name))
}
