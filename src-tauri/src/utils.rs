use std::fs;
use std::path::{Path, PathBuf};

fn dirs_path() -> PathBuf {
    dirs::home_dir().unwrap_or_else(|| PathBuf::from("."))
}

pub fn config_dir() -> PathBuf {
    let base = dirs::data_local_dir().unwrap_or_else(|| dirs_path());
    let path = base.join("DiscoMod");
    let _ = fs::create_dir_all(&path);

    let themes_path = path.join("themes");
    let _ = fs::create_dir_all(&themes_path);

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

pub fn find_win64_dir(path: &str) -> Option<PathBuf> {
    let p = Path::new(path);
    if !p.exists() {
        return None;
    }

    let current = if p.is_file() {
        p.parent()?.to_path_buf()
    } else {
        p.to_path_buf()
    };

    if current
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_lowercase()
        == "win64"
    {
        return Some(current);
    }

    let target_sequence = ["pagoda", "binaries", "win64"];
    let mut search_path = current.clone();
    let mut found_all = true;

    for target in &target_sequence {
        let mut found_next = false;
        if let Ok(entries) = fs::read_dir(&search_path) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_lowercase();
                if name == *target {
                    search_path = entry.path();
                    found_next = true;
                    break;
                }
            }
        }
        if !found_next {
            found_all = false;
            break;
        }
    }

    if found_all {
        return Some(search_path);
    }

    for ancestor in p.ancestors() {
        if let Some(name) = ancestor.file_name().and_then(|n| n.to_str()) {
            if name.to_lowercase() == "win64" {
                return Some(ancestor.to_path_buf());
            }
        }
    }

    None
}
