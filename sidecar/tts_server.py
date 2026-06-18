#!/usr/bin/env python3
"""
TTS sidecar server for Markdown Reader.
Reads JSON commands from stdin, writes JSON responses to stdout.

Protocol:
  Input:  {"type": "generate", "id": N, "text": "...", "voice": "af_heart", "speed": 1.0, "segment_index": N}
  Output: {"id": N, "audio_b64": "...", "sample_rate": 24000, "duration": 1.23, "word_timings": [...], "segment_index": N}
         {"id": N, "error": "message"}
"""
import sys
import os
import json
import base64
import struct
import io
import re

os.environ.setdefault("DYLD_LIBRARY_PATH", "/opt/homebrew/opt/espeak-ng/lib")

# Capture real stdout before libraries pollute it
_real_stdout = sys.stdout

class _StderrRedirect(io.TextIOWrapper):
    """Redirects stdout to stderr to suppress library noise during JSON protocol."""
    pass

import numpy as np

_model = None
_sample_rate = 24000


def _with_suppressed_stdout(fn, *args, **kwargs):
    """Run fn with stdout redirected to stderr so library prints don't corrupt protocol."""
    old_stdout = sys.stdout
    sys.stdout = sys.stderr
    try:
        return fn(*args, **kwargs)
    finally:
        sys.stdout = old_stdout


def get_model():
    global _model, _sample_rate
    if _model is None:
        from mlx_audio import tts
        _model = _with_suppressed_stdout(tts.load_model, "prince-canuma/Kokoro-82M")
        _sample_rate = getattr(_model, "sample_rate", 24000)
    return _model


def audio_to_wav_bytes(audio_array: np.ndarray, sample_rate: int) -> bytes:
    """Convert float32 numpy array to WAV bytes."""
    # Ensure float32 in [-1, 1] range
    audio = np.clip(audio_array.astype(np.float32), -1.0, 1.0)
    # Convert to int16 PCM
    pcm = (audio * 32767).astype(np.int16)
    pcm_bytes = pcm.tobytes()

    # Build WAV header
    num_samples = len(pcm)
    num_channels = 1
    bits_per_sample = 16
    byte_rate = sample_rate * num_channels * bits_per_sample // 8
    block_align = num_channels * bits_per_sample // 8
    data_size = num_samples * block_align
    chunk_size = 36 + data_size

    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF", chunk_size,
        b"WAVE",
        b"fmt ", 16,
        1,              # PCM format
        num_channels,
        sample_rate,
        byte_rate,
        block_align,
        bits_per_sample,
        b"data", data_size,
    )
    return header + pcm_bytes


def estimate_word_timings(text: str, duration: float) -> list:
    """
    Estimate per-word timings based on character length.
    Not perfect but gives smooth word-by-word highlighting.
    """
    # Split into words keeping track of positions
    words = re.findall(r'\S+', text)
    if not words:
        return []

    char_counts = [len(w) for w in words]
    total_chars = sum(char_counts)
    if total_chars == 0:
        return []

    timings = []
    current_time = 0.0
    for word, chars in zip(words, char_counts):
        word_duration = (chars / total_chars) * duration
        # Add slight pause weight for punctuation at end of words
        if word[-1] in '.!?':
            word_duration *= 1.3
        elif word[-1] in ',;:':
            word_duration *= 1.1
        timings.append({
            "word": word,
            "start": round(current_time, 3),
            "end": round(current_time + word_duration, 3),
        })
        current_time += word_duration

    # Normalize to actual duration
    if timings and timings[-1]["end"] > 0:
        scale = duration / timings[-1]["end"]
        for t in timings:
            t["start"] = round(t["start"] * scale, 3)
            t["end"] = round(t["end"] * scale, 3)

    return timings


def process_request(req: dict) -> dict:
    req_id = req.get("id", 0)
    try:
        text = req.get("text", "").strip()
        if not text:
            return {"id": req_id, "error": "Empty text"}
        # Kokoro struggles with very short inputs - pad if needed
        if len(text.split()) < 3:
            text = text.rstrip(".!?") + ". Right."

        voice = req.get("voice", "af_heart")
        speed = float(req.get("speed", 1.0))
        segment_index = req.get("segment_index", 0)

        model = get_model()
        sample_rate = _sample_rate

        all_audio = []

        def _generate():
            return list(model.generate(text, voice=voice, speed=speed))

        chunks = _with_suppressed_stdout(_generate)
        for chunk in chunks:
            if hasattr(chunk, "audio") and chunk.audio is not None:
                audio = chunk.audio
                # Convert MLX array to numpy
                if hasattr(audio, "tolist"):
                    arr = np.array(audio.tolist(), dtype=np.float32)
                elif hasattr(audio, "__array__"):
                    arr = np.asarray(audio, dtype=np.float32)
                else:
                    arr = np.array(audio, dtype=np.float32)
                if arr.ndim > 1:
                    arr = arr.flatten()
                all_audio.append(arr)

        if not all_audio:
            return {"id": req_id, "error": "No audio generated"}

        combined = np.concatenate(all_audio)
        duration = len(combined) / sample_rate
        wav_bytes = audio_to_wav_bytes(combined, sample_rate)
        audio_b64 = base64.b64encode(wav_bytes).decode("ascii")
        word_timings = estimate_word_timings(text, duration)

        return {
            "id": req_id,
            "audio_b64": audio_b64,
            "sample_rate": sample_rate,
            "duration": round(duration, 3),
            "word_timings": word_timings,
            "segment_index": segment_index,
        }

    except Exception as e:
        return {"id": req_id, "error": str(e)}


def emit(obj: dict) -> None:
    """Write JSON to the real stdout (not the possibly-redirected sys.stdout)."""
    _real_stdout.write(json.dumps(obj) + "\n")
    _real_stdout.flush()


def main():
    # Redirect sys.stdout to stderr globally so any library that prints
    # doesn't corrupt our JSON protocol on the real stdout.
    sys.stdout = sys.stderr

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError as e:
            emit({"id": 0, "error": f"Invalid JSON: {e}"})
            continue

        if req.get("type") == "generate":
            result = process_request(req)
            emit(result)
        elif req.get("type") == "ping":
            emit({"pong": True})


if __name__ == "__main__":
    main()
