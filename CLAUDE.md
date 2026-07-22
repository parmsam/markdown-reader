# Markdown Reader — Tauri App

## What This Is
A desktop read-aloud app for Markdown and PDF files, built with Tauri 2 + React + TypeScript. Uses Kokoro TTS via MLX (Apple Silicon) to generate natural speech, with real-time sentence and word highlighting.

## Architecture

```
markdown-reader/
├── src/                   # React frontend (Vite + TypeScript + Tailwind)
│   ├── App.tsx            # Root app: document state, layout, drag-drop
│   ├── components/
│   │   ├── WelcomeScreen.tsx   # Landing page with Open/Paste actions
│   │   ├── PasteModal.tsx      # Inline markdown editor modal
│   │   ├── MarkdownViewer.tsx  # Rendered markdown with sentence/word highlighting
│   │   ├── PlayerControls.tsx  # Play/pause/speed/voice bottom bar
│   │   └── TableOfContents.tsx # Sidebar TOC from headings
│   ├── hooks/
│   │   └── usePlayer.ts        # Player state machine + TTS queue + audio playback
│   └── lib/
│       └── textSegmenter.ts    # Splits markdown into TTS segments + TOC extraction
├── src-tauri/             # Rust backend
│   ├── src/
│   │   ├── lib.rs         # Tauri app setup, plugin registration
│   │   └── commands/
│   │       ├── tts.rs     # generate_speech, list_voices commands
│   │       └── files.rs   # read_file, convert_pdf commands
│   └── tauri.conf.json
└── sidecar/               # Python AI backends
    ├── tts_server.py      # Kokoro/MLX TTS via stdin/stdout JSON protocol
    └── pdf_converter.py   # marker-pdf for PDF→Markdown conversion
```

## Running in Development

```bash
npm run tauri dev
```

This starts:
- Vite dev server on port 1420
- Tauri app that opens a native window loading the Vite URL

## Key Dependencies

### Python (system Python 3.14 at `/Library/Frameworks/Python.framework/Versions/3.14/bin/python3`)
- `mlx-audio>=0.4.4` — Kokoro TTS on Apple Silicon
- `misaki` + `num2words` + `spacy` + `phonemizer` — text processing for Kokoro
- `marker-pdf>=2.0.0` — PDF to markdown conversion
- `en_core_web_sm` (spacy model) — must be installed separately:
  ```bash
  uv pip install --system https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl
  ```
- `espeak-ng` via Homebrew: `brew install espeak-ng`

### JavaScript
- `@tauri-apps/api` v2, plugins: dialog, fs, shell
- `react-markdown` + `remark-gfm`
- `tailwindcss`

## TTS Sidecar Protocol

The sidecar (`sidecar/tts_server.py`) communicates via stdin/stdout JSON:

**Request:**
```json
{"type": "generate", "id": 1, "text": "...", "voice": "af_heart", "speed": 1.0, "segment_index": 0}
```

**Response:**
```json
{"id": 1, "audio_b64": "<WAV as base64>", "sample_rate": 24000, "duration": 2.5, "word_timings": [{"word": "Hello", "start": 0.0, "end": 0.3}], "segment_index": 0}
```

Audio is mono 16-bit PCM WAV at 24kHz. Word timings are estimated by character-length weighting.

## Available Kokoro Voices
- `af_heart` — Heart (US, female)
- `af_nova` — Nova (US, female)
- `af_sky` — Sky (US, female)
- `am_adam` — Adam (US, male)
- `am_michael` — Michael (US, male)
- `bf_emma` — Emma (UK, female)
- `bm_george` — George (UK, male)

## Known Limitations
- Very short texts (< 3 words) cause an MLX broadcast error in Kokoro — mitigated by padding
- Word timing is estimated (character-weighted), not from forced alignment
- First TTS call is slow (~3-5s) as MLX JIT-compiles the computation graph; subsequent calls are fast
- PDF conversion via marker can be slow for large documents

## Tauri Commands (Rust → Frontend)
- `generate_speech(text, voice, speed, segmentIndex)` → `SpeechResult`
- `list_voices()` → `VoiceInfo[]`
- `read_file(path)` → `String`
- `convert_pdf(path)` → `String` (markdown)

## User Inputs Supported
1. **Open file** (📂) — `.md`, `.markdown`, `.txt`, `.pdf`
2. **Paste markdown** (📋) — inline editor modal
3. **Drag & drop** — any supported file onto the app window
