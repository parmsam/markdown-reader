#!/usr/bin/env python3
"""
Convert a Markdown document into a single narrated WAV file using Kokoro TTS via MLX.

Usage:
  python3 markdown_to_audio.py notes.md -o notes.wav --voice af_heart --speed 1.0
  cat notes.md | python3 markdown_to_audio.py -o notes.wav

Reuses the same markdown-stripping and sentence-segmentation rules as
src/lib/textSegmenter.ts, and the same per-segment generation approach as
sidecar/tts_server.py (short segments get padded to avoid an MLX broadcast
error in Kokoro).
"""
import argparse
import os
import re
import sys
import wave

os.environ.setdefault("DYLD_LIBRARY_PATH", "/opt/homebrew/opt/espeak-ng/lib")

import numpy as np


def strip_markdown(text: str) -> str:
    # Unescape CommonMark backslash-escapes (e.g. marker-pdf emits "\_\_\_\_" for
    # signature/blank lines) before the emphasis regexes below, so escaped runs of
    # punctuation don't survive as literal backslashes in the narrated text.
    text = re.sub(r"\\([\\`*_{}\[\]()#+\-.!>~])", r"\1", text)
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"\*(.+?)\*", r"\1", text)
    text = re.sub(r"__(.+?)__", r"\1", text)
    text = re.sub(r"_(.+?)_", r"\1", text)
    text = re.sub(r"~~(.+?)~~", r"\1", text)
    text = re.sub(r"`(.+?)`", r"\1", text)
    text = re.sub(r"\[(.+?)\]\(.+?\)", r"\1", text)
    text = re.sub(r"!\[.*?\]\(.+?\)", "", text)
    text = re.sub(r"#{1,6}\s+", "", text)
    text = re.sub(r">\s+", "", text)
    text = re.sub(r"[-*+]\s+", "", text)
    text = re.sub(r"\d+\.\s+", "", text)
    return text.strip()


def has_speakable_content(text: str) -> bool:
    """True if text has at least one letter or digit — filters out lines that are
    pure punctuation/underscores (e.g. signature-line placeholders like "____")."""
    return bool(re.search(r"[A-Za-z0-9]", text))


def split_sentences(text: str) -> list:
    sentences = re.split(r'(?<=[.!?])\s+(?=[A-Z"\']|$)', text)
    sentences = [s.strip() for s in sentences if s.strip()]
    return sentences if sentences else [text]


def segment_markdown(markdown: str) -> list:
    """Port of segmentMarkdown() in src/lib/textSegmenter.ts. Returns plain-text segments in reading order."""
    segments = []
    blocks = re.split(r"\n{2,}", markdown)

    for block in blocks:
        trimmed = block.strip()
        if not trimmed:
            continue

        if re.match(r"^<", trimmed):
            continue  # HTML block, nothing to read aloud
        elif re.match(r"^(-{3,}|\*{3,}|_{3,})$", trimmed):
            continue  # thematic break (horizontal rule), nothing to read aloud
        elif re.match(r"^#{1,6}\s", trimmed):
            plain = strip_markdown(trimmed)
            if plain and has_speakable_content(plain):
                segments.append(plain)
        elif re.match(r"^```", trimmed):
            segments.append("code block")
        elif re.match(r"^>", trimmed):
            plain = strip_markdown(trimmed)
            segments.extend(s for s in split_sentences(plain) if s.strip() and has_speakable_content(s))
        elif re.match(r"^[-*+]\s|^\d+\.\s", trimmed):
            for line in trimmed.split("\n"):
                plain = strip_markdown(line)
                if plain and has_speakable_content(plain):
                    segments.append(plain)
        else:
            plain = strip_markdown(trimmed)
            segments.extend(s for s in split_sentences(plain) if s.strip() and has_speakable_content(s))

    return segments


def pad_if_short(text: str) -> str:
    if len(text.split()) < 3:
        return text.rstrip(".!?") + ". Right."
    return text


def load_model():
    from mlx_audio import tts
    return tts.load_model("prince-canuma/Kokoro-82M")


def _lang_code_for_voice(voice: str) -> str:
    """Kokoro voice ids are prefixed with their language code (af_/am_ -> 'a' US English,
    bf_/bm_ -> 'b' UK English, etc). Passing the matching lang_code avoids mis-phonemizing
    UK voices with the US English pipeline (and vice versa)."""
    return voice[0] if voice else "a"


def _generate_raw(model, text, voice, speed):
    arrays = []
    lang_code = _lang_code_for_voice(voice)
    for chunk in model.generate(text, voice=voice, speed=speed, lang_code=lang_code):
        audio = getattr(chunk, "audio", None)
        if audio is None:
            continue
        arr = np.asarray(audio, dtype=np.float32)
        if arr.ndim > 1:
            arr = arr.flatten()
        arrays.append(arr)
    return np.concatenate(arrays) if arrays else None


def generate_segment_audio(model, text, voice, speed, depth=0):
    """
    Generate audio for one segment, working around a known shape-mismatch bug in
    mlx_audio's Kokoro decoder that a small fraction of phoneme lengths trigger
    (ValueError: [broadcast_shapes] ...). Retries with trailing punctuation
    stripped (often enough to dodge it), then falls back to splitting the
    segment in half and stitching the halves together.
    """
    try:
        return _generate_raw(model, text, voice, speed)
    except ValueError as e:
        if "broadcast_shapes" not in str(e):
            raise

    stripped = text.rstrip(".!?,;: ")
    if stripped and stripped != text:
        try:
            return _generate_raw(model, stripped, voice, speed)
        except ValueError as e:
            if "broadcast_shapes" not in str(e):
                raise

    words = text.split()
    if depth >= 4 or len(words) < 4:
        return None  # give up; caller will skip this segment

    mid = len(words) // 2
    left = generate_segment_audio(model, " ".join(words[:mid]), voice, speed, depth + 1)
    right = generate_segment_audio(model, " ".join(words[mid:]), voice, speed, depth + 1)
    parts = [p for p in (left, right) if p is not None]
    return np.concatenate(parts) if parts else None


def write_wav(path: str, audio: np.ndarray, sample_rate: int) -> None:
    pcm = (np.clip(audio, -1.0, 1.0) * 32767).astype(np.int16)
    with wave.open(path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm.tobytes())


def narrate_to_wav(markdown: str, output_path: str, voice: str = "af_heart",
                    speed: float = 1.0, pause: float = 0.35, model=None) -> tuple:
    """
    Segment markdown, narrate every segment with Kokoro, and write one WAV file.
    Returns (duration_seconds, segment_count). Shared by this script's CLI and by
    other skills (e.g. pdf-to-audio) that produce markdown from another source.
    """
    segments = segment_markdown(markdown)
    if not segments:
        raise ValueError("No readable text found in input.")

    if model is None:
        print("Loading Kokoro model (first run may take a few seconds)...", file=sys.stderr)
        model = load_model()
    sample_rate = getattr(model, "sample_rate", 24000)
    silence = np.zeros(int(sample_rate * pause), dtype=np.float32)

    all_audio = []
    total = len(segments)
    for i, seg in enumerate(segments, 1):
        text = pad_if_short(seg)
        print(f"[{i}/{total}] {seg[:60]!r}", file=sys.stderr)
        audio = generate_segment_audio(model, text, voice, speed)
        if audio is None:
            print(f"  warning: no audio produced for segment {i}, skipping", file=sys.stderr)
            continue
        all_audio.append(audio)
        all_audio.append(silence)

    if not all_audio:
        raise RuntimeError("Failed to generate any audio.")

    combined = np.concatenate(all_audio)
    write_wav(output_path, combined, sample_rate)
    return len(combined) / sample_rate, total


def main():
    parser = argparse.ArgumentParser(description="Convert markdown to a narrated audio file")
    parser.add_argument("input", nargs="?", help="Path to a markdown file (omit to read stdin)")
    parser.add_argument("-o", "--output", default="output.wav", help="Output WAV path")
    parser.add_argument("--voice", default="af_heart", help="Kokoro voice id (see README for the list)")
    parser.add_argument("--speed", type=float, default=1.0, help="Speech speed multiplier")
    parser.add_argument("--pause", type=float, default=0.35, help="Silence in seconds inserted between segments")
    args = parser.parse_args()

    if args.input:
        with open(args.input, "r", encoding="utf-8") as f:
            markdown = f.read()
    else:
        markdown = sys.stdin.read()

    try:
        duration, total = narrate_to_wav(markdown, args.output, args.voice, args.speed, args.pause)
    except (ValueError, RuntimeError) as e:
        print(str(e), file=sys.stderr)
        sys.exit(1)

    print(f"Wrote {args.output} ({duration:.1f}s, {total} segments)", file=sys.stderr)


if __name__ == "__main__":
    main()
