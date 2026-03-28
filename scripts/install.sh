#!/usr/bin/env bash
# rival CLI — one-line installer
# Usage: curl -fsSL https://rival.io/install.sh | bash
set -euo pipefail

REPO="rival-io/rival-cli"
BINARY="rival"
INSTALL_DIR="${RIVAL_INSTALL_DIR:-/usr/local/bin}"

# ── Detect OS / arch ──────────────────────────────────────────────────────────
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin)
    case "$ARCH" in
      arm64)  ASSET="rival-macos-arm64" ;;
      x86_64) ASSET="rival-macos-x64"  ;;
      *) echo "Unsupported architecture: $ARCH" >&2; exit 1 ;;
    esac
    ;;
  Linux)
    case "$ARCH" in
      x86_64) ASSET="rival-linux-x64" ;;
      *) echo "Unsupported architecture: $ARCH" >&2; exit 1 ;;
    esac
    ;;
  *)
    echo "Unsupported OS: $OS" >&2
    echo "Install via npm instead:  npm install -g @rival/cli" >&2
    exit 1
    ;;
esac

# ── Fetch latest version tag ──────────────────────────────────────────────────
echo "Fetching latest release…"
VERSION=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
  | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"\(.*\)".*/\1/')

if [ -z "$VERSION" ]; then
  echo "Could not determine latest version." >&2
  exit 1
fi

echo "Installing rival ${VERSION}…"

# ── Download binary ───────────────────────────────────────────────────────────
TMP="$(mktemp)"
curl -fsSL "https://github.com/${REPO}/releases/download/${VERSION}/${ASSET}" -o "$TMP"

# ── Verify SHA256 ─────────────────────────────────────────────────────────────
EXPECTED=$(curl -fsSL "https://github.com/${REPO}/releases/download/${VERSION}/${ASSET}.sha256")
if command -v sha256sum &>/dev/null; then
  ACTUAL=$(sha256sum "$TMP" | awk '{print $1}')
elif command -v shasum &>/dev/null; then
  ACTUAL=$(shasum -a 256 "$TMP" | awk '{print $1}')
else
  echo "Warning: cannot verify checksum (sha256sum/shasum not found)" >&2
  ACTUAL="$EXPECTED"
fi

if [ "$ACTUAL" != "$EXPECTED" ]; then
  echo "Checksum mismatch — download may be corrupted." >&2
  rm -f "$TMP"
  exit 1
fi

# ── Install ───────────────────────────────────────────────────────────────────
chmod +x "$TMP"

if [ -w "$INSTALL_DIR" ]; then
  mv "$TMP" "${INSTALL_DIR}/${BINARY}"
else
  sudo mv "$TMP" "${INSTALL_DIR}/${BINARY}"
fi

echo ""
echo "✓ rival ${VERSION} installed to ${INSTALL_DIR}/${BINARY}"
echo ""
echo "  rival login    # get started"
echo "  rival --help   # all commands"
