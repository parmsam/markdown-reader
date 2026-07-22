---
name: pdf-to-audio
description: Convert a PDF file into a single narrated WAV audio file — converts PDF to markdown with marker-pdf, then narrates it with Kokoro TTS via MLX (Apple Silicon). Use when the user gives a PDF and wants to listen to it, or asks to turn a .pdf into audio/a podcast/narration they can play outside any app.
allowed-tools: Bash, Write, Read
---

# PDF to Audio

Converts a PDF into one narrated `.wav` file via `scripts/pdf_to_audio.py`, which chains two
steps: PDF → Markdown using [marker-pdf](https://github.com/datalab-to/marker) (same converter
the app uses in `sidecar/pdf_converter.py`), then Markdown → narrated WAV by calling into the
[`markdown-to-audio`](../markdown-to-audio/SKILL.md) skill's script.

**This skill depends on `markdown-to-audio` being installed alongside it** (as siblings under
`.claude/skills/`) — it imports that skill's segmentation and TTS-generation code rather than
duplicating it. If you copy this skill to another machine or project, copy both folders.

## When to Use

The user gives a PDF (by path) and wants an audio file out of it, or asks to "convert this PDF
to audio", "read this PDF to me", "make a narration/podcast of this paper", etc. For markdown
input, use the `markdown-to-audio` skill directly instead — it's faster since it skips PDF
conversion entirely.

## Setup (first use on a machine)

Everything `markdown-to-audio` needs, plus `marker-pdf`:

```bash
python3 -c "import mlx_audio" 2>/dev/null && echo OK || echo MISSING
python3 -c "import marker" 2>/dev/null && echo OK || echo MISSING
which espeak-ng >/dev/null 2>&1 && echo OK || echo MISSING
```

If anything is missing:

```bash
pip3 install -r "<skill-dir>/scripts/requirements.txt"
brew install espeak-ng
```

Apple Silicon (M-series) is required for the TTS step (MLX doesn't run on Intel Macs).
`marker-pdf` itself will download its layout/OCR models on first use (a few hundred MB).

## Arguments

- $ARGUMENTS should contain a path to a `.pdf` file, plus optionally an output path, voice, and
  speed. If the user pasted text instead of naming a PDF, this is the wrong skill — use
  `markdown-to-audio`.

## Voice Options

Same voices as `markdown-to-audio`: `af_heart` (default, US female), `af_nova`, `af_sky`
(US female), `am_adam`, `am_michael` (US male), `bf_emma` (UK female), `bm_george` (UK male).
Map natural-language requests ("a British accent") to the closest id yourself.

## Process

### Step 1 — Pick an output path

Default to the same directory as the PDF, same basename with a `.wav` extension
(`report.pdf` → `report.wav`). Confirm with the user only if ambiguous.

### Step 2 — Warn about time

marker-pdf's conversion is the slow part — it can take anywhere from ~10s to a few minutes
depending on page count and whether OCR is needed. Tell the user this before starting on
anything more than a few pages, and stream progress as it happens.

### Step 3 — Run the converter

Resolve `scripts/pdf_to_audio.py` relative to this SKILL.md's own directory, then run:

```bash
python3 "<skill-dir>/scripts/pdf_to_audio.py" \
  "<input.pdf>" \
  -o "<output.wav>" \
  --voice af_heart \
  --speed 1.0
```

Add `--keep-markdown <path>` if the user might also want the intermediate markdown (useful for
proofreading what will be read aloud, e.g. tables/figures don't narrate well).

### Step 4 — Report the result

Confirm the output path, duration, and segment count (printed on the script's last line), and
mention `afplay <output.wav>` to preview it on macOS.

## Notes

- Output is 24kHz mono 16-bit PCM WAV, same as `markdown-to-audio`.
- Scanned/image-only PDFs rely on marker's OCR path and will be noticeably slower and less
  accurate than text-based PDFs.
- Tables, figures, and math-heavy sections often convert to markdown that reads awkwardly
  aloud — this is a property of the source PDF, not a bug in the script. Use `--keep-markdown`
  and skim it if narration quality matters.
- Inherits `markdown-to-audio`'s handling of a known `mlx_audio` Kokoro decoder bug (retries
  with punctuation stripped, then splits segments in half) — no extra handling needed here.
