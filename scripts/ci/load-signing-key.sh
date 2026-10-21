#!/usr/bin/env bash
# CI only. Decodes the ANDROID_KEYSTORE_BASE64 secret into the runner's temp dir, checks it opens
# with ANDROID_KEYSTORE_PASSWORD, and exports ODOS_KEYSTORE_FILE for plugins/withReleaseSigning.js.
# Usage: load-signing-key.sh [--require]   (--require fails instead of falling back to the debug key)
set -euo pipefail

if [ -z "${KEYSTORE_BASE64:-}" ]; then
  if [ "${1:-}" = "--require" ]; then
    echo "::error::ANDROID_KEYSTORE_BASE64 secret is not set. Google Play builds must be signed with ODOS's key."
    exit 1
  fi
  echo "::warning::ANDROID_KEYSTORE_BASE64 secret is not set. This build is signed with the shared debug key."
  exit 0
fi
if [ -z "${KEYSTORE_PASSWORD:-}" ]; then
  echo "::error::ANDROID_KEYSTORE_BASE64 is set but ANDROID_KEYSTORE_PASSWORD is not."
  exit 1
fi
KEYSTORE="$RUNNER_TEMP/odos-release.keystore"
printf '%s' "$KEYSTORE_BASE64" | tr -d ' \r\n' | base64 -d > "$KEYSTORE"
if ! keytool -list -keystore "$KEYSTORE" -storepass "$KEYSTORE_PASSWORD" -alias odos >/dev/null; then
  echo "::error::Couldn't open the signing key: check that both secrets were pasted in full."
  exit 1
fi
echo "ODOS_KEYSTORE_FILE=$KEYSTORE" >> "$GITHUB_ENV"
