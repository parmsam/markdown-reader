use tauri::Manager;

mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|_app| {
            // Uncomment to open DevTools in dev mode:
            // #[cfg(debug_assertions)]
            // if let Some(window) = _app.get_webview_window("main") {
            //     window.open_devtools();
            // }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::tts::generate_speech,
            commands::tts::list_voices,
            commands::files::read_file,
            commands::files::convert_pdf,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
