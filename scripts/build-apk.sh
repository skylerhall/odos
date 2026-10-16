#!/usr/bin/env bash
# Build a standalone, installable ODOS APK on your own computer.
# Usage:  npm run apk      (or: bash scripts/build-apk.sh)
set -euo pipefail
cd "$(dirname "$0")/.."

say() { printf '\n\033[1m▶ %s\033[0m\n' "$1"; }

say "Checking your Mapbox token"
if ! grep -qE '^EXPO_PUBLIC_MAPBOX_TOKEN=pk\.' .env 2>/dev/null; then
  echo "No Mapbox token found. Do this first:"
  echo "  cp .env.example .env"
  echo "  then paste your public token (starts with pk.) into .env"
  echo "Without it the map is blank and directions won't work."
  exit 1
fi
echo "OK"

say "Checking Java"
if ! command -v java >/dev/null; then
  echo "Java isn't installed. Install a JDK 17 or newer (Android Studio includes one), then re-run."
  exit 1
fi
java -version 2>&1 | head -1

say "Finding the Android SDK"
if [ -z "${ANDROID_HOME:-}" ]; then
  for d in "$HOME/Library/Android/sdk" "$HOME/Android/Sdk" "$HOME/AppData/Local/Android/Sdk"; do
    [ -d "$d" ] && export ANDROID_HOME="$d" && break
  done
fi
if [ -z "${ANDROID_HOME:-}" ]; then
  echo "Android SDK not found. Install Android Studio once (it downloads the SDK), then re-run."
  exit 1
fi
echo "$ANDROID_HOME"

say "Installing packages"
npm install

say "Generating the Android project from app.json"
npx expo prebuild --platform android --clean --no-install
echo "sdk.dir=$ANDROID_HOME" > android/local.properties

say "Building the release APK (first build takes a few minutes)"
(cd android && ./gradlew assembleRelease)

APK=android/app/build/outputs/apk/release/app-release.apk
cp "$APK" ./odos.apk
say "Done: $(pwd)/odos.apk"
echo "Put it on your phone: upload odos.apk to Google Drive, open it on the phone, tap Install."
echo "(Android asks once to allow installs from Drive. That's normal for sideloading.)"
if command -v open >/dev/null; then open -R ./odos.apk; fi
