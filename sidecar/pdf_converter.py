#!/usr/bin/env python3
"""
PDF to Markdown converter using marker-pdf.
Usage: python pdf_converter.py <path_to_pdf>
Outputs markdown to stdout.
"""
import sys
import os


def convert_pdf(pdf_path: str) -> str:
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
        # Fallback: try older marker API
        try:
            from marker.convert import convert_single_pdf
            from marker.models import load_all_models

            model_lst = load_all_models()
            full_text, _, _ = convert_single_pdf(pdf_path, model_lst)
            return full_text
        except Exception as e:
            raise RuntimeError(f"marker-pdf API not available: {e}")


def main():
    if len(sys.argv) < 2:
        print("Usage: pdf_converter.py <pdf_path>", file=sys.stderr)
        sys.exit(1)

    pdf_path = sys.argv[1]
    if not os.path.exists(pdf_path):
        print(f"File not found: {pdf_path}", file=sys.stderr)
        sys.exit(1)

    try:
        markdown = convert_pdf(pdf_path)
        print(markdown, end="")
    except Exception as e:
        print(f"Conversion error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
