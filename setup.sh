#!/usr/bin/env bash
set -e

echo "=== Markdown Reader — dependency setup ==="
echo ""

# Check Apple Silicon
if [[ $(uname -m) != "arm64" ]]; then
  echo "Error: This app requires Apple Silicon (M1/M2/M3)."
  echo "MLX does not support Intel Macs."
  exit 1
fi

# Homebrew
if ! command -v brew &>/dev/null; then
  echo "Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

echo "Installing espeak-ng..."
brew install espeak-ng

# Python
PY=$(command -v python3 || true)
if [[ -z "$PY" ]]; then
  echo "Installing Python via Homebrew..."
  brew install python
  PY=$(command -v python3)
fi

echo "Using Python: $PY ($($PY --version))"

echo ""
echo "Installing Python packages..."
$PY -m pip install mlx-audio misaki num2words phonemizer marker-pdf spacy --quiet

echo ""
echo "Installing spaCy English model..."
$PY -m pip install \
  "https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl" \
  --quiet

echo ""
echo "=== Setup complete! ==="
echo ""
echo "First launch note:"
echo "  The first time you read a document, the Kokoro model is downloaded"
echo "  from HuggingFace (~330 MB) and MLX compiles the kernels."
echo "  This takes ~30 s the first time; subsequent launches are fast."
echo ""
echo "If the app shows 'damaged and can't be opened' after downloading:"
echo "  xattr -dr com.apple.quarantine /Applications/Markdown\\ Reader.app"
echo ""
