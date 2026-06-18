use std::process::Stdio;
use tauri::{AppHandle, Manager};
use tokio::process::Command;

#[tauri::command]
pub async fn read_file(path: String) -> Result<String, String> {
    tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| format!("Failed to read file: {e}"))
}

#[tauri::command]
pub async fn convert_pdf(app: AppHandle, path: String) -> Result<String, String> {
    let sidecar_dir = std::path::PathBuf::from(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../sidecar"
    ));
    let script = sidecar_dir.join("pdf_converter.py");

    let resource_dir = app
        .path()
        .resource_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."));
    let bundled_script = resource_dir.join("binaries/pdf-converter.py");

    let script_path = if bundled_script.exists() {
        bundled_script
    } else {
        script
    };

    let python = find_python();
    let output = Command::new(&python)
        .arg(&script_path)
        .arg(&path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to run PDF converter: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("PDF conversion failed: {stderr}"));
    }

    String::from_utf8(output.stdout)
        .map_err(|e| format!("Invalid UTF-8 output: {e}"))
}

fn find_python() -> String {
    for candidate in &[
        "/Library/Frameworks/Python.framework/Versions/3.14/bin/python3",
        "/usr/local/bin/python3",
        "/opt/homebrew/bin/python3",
        "python3",
    ] {
        if std::path::Path::new(candidate).exists() {
            return candidate.to_string();
        }
    }
    "python3".to_string()
}
