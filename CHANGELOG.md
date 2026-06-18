# Changelog

All notable changes to this project will be documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [0.1.1] — 2026-06-18

### Added
- **Word-click jumping** — every word in paragraph text is an individual click target; hovering highlights it amber, clicking jumps to the start of that sentence for finer navigation than section-level TOC
- **Keyboard shortcuts** — `Space` play/pause, `←`/`→` skip sentence, `[`/`]` speed down/up; shown in button tooltips
- **Reading progress** — saves your position per-document to localStorage; re-opening a file offers to resume or start over

### Fixed
- Unused `tauri::Manager` import warning in `lib.rs`

---

## [0.1.0] — 2026-06-18

### Added
- **Read aloud** — Kokoro TTS on Apple Silicon via MLX; natural-sounding voices with low latency
- **Real-time highlighting** — current sentence highlighted, individual words light up as spoken
- **Playback controls** — play, pause, stop, skip forward/back, speed (0.5×–2×), 7 voices
- **Click to jump** — click any sentence in the viewer to start reading from there
- **Table of contents** — sidebar auto-generated from document headings; click to jump to section
- **PDF support** — convert PDF → Markdown via marker-pdf; drop or open any PDF
- **Three input methods** — open file (`.md`, `.pdf`, `.txt`), paste markdown, or drag & drop
- **Light & dark mode** — system preference detected on first launch; toggle in toolbar
- **Manual scrolling** — scroll freely while reading; auto-scroll resumes after 2.5 s idle
- **Lookahead prefetch** — next 2 segments pre-generated while current one plays for uninterrupted flow
