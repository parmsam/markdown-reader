---
name: markdown-to-audio
description: Convert markdown content (pasted text or a file) into a single narrated WAV audio file using Kokoro TTS via MLX (Apple Silicon). Use when the user pastes markdown and wants to listen to it, or asks to turn a .md file into audio/a podcast/narration they can play outside any app.
allowed-tools: Bash, Write, Read
---

# Markdown to Audio

Converts markdown into one narrated `.wav` file via the bundled `scripts/markdown_to_audio.py`
— a self-contained script (no dependency on any host project) that strips markdown formatting,
segments it into sentences, and narrates it with the open-weights Kokoro TTS model running
locally through `mlx-audio`. Works on any macOS machine with Apple Silicon; nothing here depends
on this being run inside the markdown-reader repo.

## When to Use

The user pastes/provides markdown content and wants an audio file out of it, or asks to
"convert this markdown to audio", "read this to me as an mp3/wav I can keep", "make a
narration of this file", etc.

## Setup (first use on a machine)

Check the dependencies are installed before running the script:

```bash
python3 -c "import mlx_audio" 2>/dev/null && echo OK || echo MISSING
which espeak-ng >/dev/null 2>&1 && echo OK || echo MISSING
```

If either is missing, install them (this only needs doing once per machine):

```bash
pip3 install -r "<skill-dir>/scripts/requirements.txt"
brew install espeak-ng
```

Apple Silicon (M-series) is required — `mlx-audio` uses MLX, which does not run on Intel Macs
or other platforms.

## Arguments

- $ARGUMENTS may contain: a path to a `.md`/`.markdown`/`.txt` file, a desired output path,
  a voice, and/or a speed. Pasted markdown content (not a path) is treated as the source
  text directly.
- If the user pasted markdown inline instead of naming a file, write it to a temp file first
  (e.g. `/tmp/md-to-audio-input.md`) and pass that path to the script.

## Voice Options

Pass `--voice <id>` to the script. Present these as the available options if the user asks
what's available, and map natural-language requests ("a British accent", "male voice",
"something upbeat") to the closest id yourself rather than asking a clarifying question:

| id | accent | gender |
|---|---|---|
| `af_heart` (default) | US | female |
| `af_nova` | US | female |
| `af_sky` | US | female |
| `am_adam` | US | male |
| `am_michael` | US | male |
| `bf_emma` | UK | female |
| `bm_george` | UK | male |

Only ask the user to choose explicitly if they invoke the skill without naming a preference
and it seems like something they'd care about (e.g. they're producing something to share)
— for a quick one-off listen, just default to `af_heart` and mention the voice used can be
changed with `--voice` on a re-run.

## Process

### Step 1 — Get the markdown into a file

If the user gave a file path, use it directly. If they pasted content in the chat, write it
verbatim to a temp file:

```bash
cat > /tmp/md-to-audio-input.md <<'MDEOF'
<pasted content>
MDEOF
```

### Step 2 — Pick an output path

Default to the same directory as the source file (or `~/Desktop` if the content was pasted),
named after the document's first heading (slugified) or `narration.wav` if none. Confirm the
path with the user only if it's ambiguous.

### Step 3 — Run the converter

The script lives at `scripts/markdown_to_audio.py` relative to this SKILL.md's own directory —
resolve that path first, then run:

```bash
python3 "<skill-dir>/scripts/markdown_to_audio.py" \
  "<input.md>" \
  -o "<output.wav>" \
  --voice af_heart \
  --speed 1.0
```

Stream the script's stderr progress lines (`[i/N] '...'`) to the user as it runs so they can
see it working — the first run is slow (~3-5s) while MLX JIT-compiles the model.

### Step 4 — Report the result

Confirm the output path, duration, and segment count (the script prints these on its last
line), and mention the file can be opened with any audio player (e.g. `afplay <output.wav>`
to preview it immediately on macOS).

## Notes

- Output is 24kHz mono 16-bit PCM WAV — universally playable, no extra codec deps required.
- Very short documents (<3 words) are auto-padded to avoid a known MLX broadcast error in
  Kokoro for very short inputs.
- Some sentences deterministically trigger a `broadcast_shapes` crash in the installed
  `mlx_audio` Kokoro decoder (an off-by-one in its duration predictor for certain phoneme
  lengths). The script retries with trailing punctuation stripped, then falls back to
  splitting the segment in half, so one bad sentence can't abort the whole run — you don't
  need to work around this yourself.
- If the user wants MP3 instead of WAV and has `ffmpeg` installed, offer to convert after
  the fact: `ffmpeg -i output.wav -codec:a libmp3lame -qscale:a 2 output.mp3`. Don't assume
  ffmpeg is present — check first with `which ffmpeg`.
- For very long documents this can take a while (roughly real-time on Apple Silicon, i.e. a
  10-minute read takes a few minutes to generate) — warn the user before starting on anything
  long.
