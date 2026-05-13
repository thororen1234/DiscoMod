const VERSION: &str = env!("DISCOMOD_VERSION");
const API_URL: &str = "https://api.github.com/repos/thororen1234/DiscoMod/releases/latest";
const USER_AGENT: &str = "DiscoMod-Updater";

#[tauri::command]
pub async fn check_for_updates() -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let resp = client
        .get(API_URL)
        .header("User-Agent", USER_AGENT)
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status().as_u16()));
    }

    let data: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;

    let latest_version = data["tag_name"]
        .as_str()
        .unwrap_or("")
        .trim_start_matches('v')
        .to_string();

    let html_url = data["html_url"].as_str().unwrap_or("").to_string();
    let changelog = data["body"].as_str().unwrap_or("").to_string();

    let is_newer = version_is_newer(&latest_version, VERSION);

    Ok(serde_json::json!({
        "latestVersion": latest_version,
        "currentVersion": VERSION,
        "htmlUrl": html_url,
        "changelog": changelog,
        "isNewer": is_newer,
    }))
}

fn parse_version(v: &str) -> Vec<u32> {
    let re = regex::Regex::new(r"(\d+(?:\.\d+)*)").unwrap();
    if let Some(caps) = re.captures(v) {
        return caps[1].split('.').filter_map(|s| s.parse().ok()).collect();
    }
    vec![]
}

fn version_is_newer(remote: &str, local: &str) -> bool {
    let mut rv = parse_version(remote);
    let mut lv = parse_version(local);

    let max_len = rv.len().max(lv.len());
    rv.resize(max_len, 0);
    lv.resize(max_len, 0);

    for (r, l) in rv.iter().zip(lv.iter()) {
        if r > l {
            return true;
        }
        if r < l {
            return false;
        }
    }
    false
}
