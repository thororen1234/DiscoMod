use std::env;
use std::fs;
use std::path::{Path, PathBuf};

fn dirs_path() -> PathBuf {
    dirs::home_dir().unwrap_or_else(|| PathBuf::from("."))
}

pub fn config_dir() -> PathBuf {
    let base = env::var("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|_| dirs_path());
    let path = base.join("DiscoMod");
    fs::create_dir_all(&path).ok();
    path
}

pub fn safe_folder_name(text: &str) -> String {
    let invalid = r#"\/:*?"<>|"#;
    text.chars()
        .map(|c| if invalid.contains(c) { '_' } else { c })
        .collect::<String>()
        .trim()
        .to_string()
}

pub fn unique_dest(base_dir: &Path, folder_name: &str) -> PathBuf {
    let base = base_dir.join(folder_name);
    if !base.exists() {
        return base;
    }
    let mut counter = 1;
    loop {
        let candidate = base_dir.join(format!("{}_{}", folder_name, counter));
        if !candidate.exists() {
            return candidate;
        }
        counter += 1;
    }
}

pub fn rand_u64() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or(12345) as u64;
    nanos ^ (std::process::id() as u64 * 0x9e3779b97f4a7c15)
}
