use serde::{Deserialize, Serialize};
use std::process::Stdio;
use tauri::{AppHandle, Manager};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct WordTiming {
    pub word: String,
    pub start: f64,
    pub end: f64,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct SpeechResult {
    pub audio_b64: String,
    pub sample_rate: u32,
    pub duration: f64,
    pub word_timings: Vec<WordTiming>,
    pub segment_index: usize,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct VoiceInfo {
    pub id: String,
    pub name: String,
    pub language: String,
}

#[derive(Serialize, Deserialize)]
struct TtsRequest {
    #[serde(rename = "type")]
    request_type: String,
    id: usize,
    text: String,
    voice: String,
    speed: f64,
    segment_index: usize,
}

#[derive(Serialize, Deserialize)]
struct TtsResponse {
    id: usize,
    audio_b64: Option<String>,
    sample_rate: Option<u32>,
    duration: Option<f64>,
    word_timings: Option<Vec<WordTiming>>,
    segment_index: Option<usize>,
    error: Option<String>,
}

fn get_sidecar_path(app: &AppHandle) -> std::path::PathBuf {
    // In dev: use Python script directly from sidecar/
    // In prod: use bundled binary
    let resource_dir = app
        .path()
        .resource_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."));

    let bundled = resource_dir.join("binaries/tts-sidecar");
    if bundled.exists() {
        return bundled;
    }

    // Development fallback
    std::path::PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/../sidecar/tts_server.py"))
}

#[tauri::command]
pub async fn generate_speech(
    app: AppHandle,
    text: String,
    voice: String,
    speed: f64,
    segment_index: usize,
) -> Result<SpeechResult, String> {
    let sidecar_path = get_sidecar_path(&app);

    let python = find_python();
    let mut child = Command::new(&python)
        .arg(&sidecar_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("DYLD_LIBRARY_PATH", "/opt/homebrew/opt/espeak-ng/lib")
        .spawn()
        .map_err(|e| format!("Failed to start TTS sidecar: {e}"))?;

    let request = TtsRequest {
        request_type: "generate".to_string(),
        id: segment_index,
        text,
        voice,
        speed,
        segment_index,
    };

    let request_json = serde_json::to_string(&request).map_err(|e| e.to_string())?;

    if let Some(stdin) = child.stdin.take() {
        let mut stdin = stdin;
        stdin
            .write_all((request_json + "\n").as_bytes())
            .await
            .map_err(|e| format!("Failed to write to sidecar: {e}"))?;
        stdin.shutdown().await.ok();
    }

    let stdout = child.stdout.take().ok_or("No stdout")?;
    let mut reader = BufReader::new(stdout).lines();

    let mut result_line = String::new();
    while let Some(line) = reader.next_line().await.map_err(|e| e.to_string())? {
        let trimmed = line.trim().to_string();
        if trimmed.starts_with('{') {
            result_line = trimmed;
            break;
        }
    }

    child.wait().await.ok();

    if result_line.is_empty() {
        return Err("No response from TTS sidecar".to_string());
    }

    let response: TtsResponse =
        serde_json::from_str(&result_line).map_err(|e| format!("Failed to parse response: {e}"))?;

    if let Some(err) = response.error {
        return Err(err);
    }

    Ok(SpeechResult {
        audio_b64: response.audio_b64.unwrap_or_default(),
        sample_rate: response.sample_rate.unwrap_or(24000),
        duration: response.duration.unwrap_or(0.0),
        word_timings: response.word_timings.unwrap_or_default(),
        segment_index: response.segment_index.unwrap_or(segment_index),
    })
}

#[tauri::command]
pub async fn list_voices() -> Result<Vec<VoiceInfo>, String> {
    Ok(vec![
        VoiceInfo {
            id: "af_heart".to_string(),
            name: "Heart (US)".to_string(),
            language: "American English".to_string(),
        },
        VoiceInfo {
            id: "af_nova".to_string(),
            name: "Nova (US)".to_string(),
            language: "American English".to_string(),
        },
        VoiceInfo {
            id: "af_sky".to_string(),
            name: "Sky (US)".to_string(),
            language: "American English".to_string(),
        },
        VoiceInfo {
            id: "am_adam".to_string(),
            name: "Adam (US Male)".to_string(),
            language: "American English".to_string(),
        },
        VoiceInfo {
            id: "am_michael".to_string(),
            name: "Michael (US Male)".to_string(),
            language: "American English".to_string(),
        },
        VoiceInfo {
            id: "bf_emma".to_string(),
            name: "Emma (UK)".to_string(),
            language: "British English".to_string(),
        },
        VoiceInfo {
            id: "bm_george".to_string(),
            name: "George (UK Male)".to_string(),
            language: "British English".to_string(),
        },
    ])
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
