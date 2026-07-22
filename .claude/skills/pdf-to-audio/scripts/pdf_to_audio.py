#!/usr/bin/env python3
"""
Convert a PDF into a single narrated WAV file: PDF -> Markdown (marker-pdf) -> Kokoro TTS (MLX).

Usage:
  python3 pdf_to_audio.py document.pdf -o document.wav --voice af_heart --speed 1.0

Depends on the markdown-to-audio skill being installed alongside this one — it imports
segmentation and TTS-generation logic from ../markdown-to-audio/scripts/markdown_to_audio.py
rather than duplicating it, so both skills share one (already fixed-up) TTS code path.
"""
import argparse
import os
import sys

os.environ.setdefault("DYLD_LIBRARY_PATH", "/opt/homebrew/opt/espeak-ng/lib")

_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
_MD_TO_AUDIO_SCRIPTS = os.path.normpath(
    os.path.join(_THIS_DIR, "..", "..", "markdown-to-audio", "scripts")
)
if os.path.isdir(_MD_TO_AUDIO_SCRIPTS):
    sys.path.insert(0, _MD_TO_AUDIO_SCRIPTS)

try:
    from markdown_to_audio import narrate_to_wav, load_model
except ImportError:
    print(
        "error: could not import markdown_to_audio.py\n"
        "pdf-to-audio depends on the markdown-to-audio skill being installed alongside it "
        "at ../markdown-to-audio/scripts/ — install/copy both skills together.",
        file=sys.stderr,
    )
    sys.exit(1)


def convert_pdf_to_markdown(pdf_path: str) -> str:
    try:
        from marker.converters.pdf import PdfConverter
        from marker.models import create_model_dict
        from marker.output import text_from_rendered

        models = create_model_dict()
        converter = PdfConverter(artifact_dict=models)
        rendered = converter(pdf_path)
        text, _, _ = text_from_rendered(rendered)
        return text
    except ImportError:
        try:
            from marker.convert import convert_single_pdf
            from marker.models import load_all_models

            model_lst = load_all_models()
            full_text, _, _ = convert_single_pdf(pdf_path, model_lst)
            return full_text
        except Exception as e:
            raise RuntimeError(f"marker-pdf API not available: {e}")


def main():
    parser = argparse.ArgumentParser(description="Convert a PDF into a narrated audio file")
    parser.add_argument("input", help="Path to a PDF file")
    parser.add_argument("-o", "--output", default="output.wav", help="Output WAV path")
    parser.add_argument("--voice", default="af_heart", help="Kokoro voice id")
    parser.add_argument("--speed", type=float, default=1.0, help="Speech speed multiplier")
    parser.add_argument("--pause", type=float, default=0.35, help="Silence in seconds inserted between segments")
    parser.add_argument("--keep-markdown", help="Optional path to also save the intermediate markdown")
    args = parser.parse_args()

    if not os.path.exists(args.input):
        print(f"File not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    print("Converting PDF to markdown with marker-pdf (this can take a while)...", file=sys.stderr)
    try:
        markdown = convert_pdf_to_markdown(args.input)
    except RuntimeError as e:
        print(str(e), file=sys.stderr)
        sys.exit(1)

    if args.keep_markdown:
        with open(args.keep_markdown, "w", encoding="utf-8") as f:
            f.write(markdown)
        print(f"Wrote intermediate markdown to {args.keep_markdown}", file=sys.stderr)

    try:
        duration, total = narrate_to_wav(markdown, args.output, args.voice, args.speed, args.pause)
    except (ValueError, RuntimeError) as e:
        print(str(e), file=sys.stderr)
        sys.exit(1)

    print(f"Wrote {args.output} ({duration:.1f}s, {total} segments)", file=sys.stderr)


if __name__ == "__main__":
    main()
