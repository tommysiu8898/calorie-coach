#!/usr/bin/env bash
# =============================================================================
# eas-build.sh — EAS build helper for the Calories Coach AI mobile app
#
# Usage:
#   ./scripts/eas-build.sh [--platform <ios|android|all>] [--profile <profile>] [extra eas flags]
#
# Options:
#   --platform   ios | android | all  (default: ios)
#   --profile    development | development-simulator | preview | production
#                (default: development)
#
# Examples:
#   ./scripts/eas-build.sh
#   ./scripts/eas-build.sh --platform ios --profile development-simulator
#   ./scripts/eas-build.sh --platform ios --profile production
#   ./scripts/eas-build.sh --platform android --profile preview
#   ./scripts/eas-build.sh --profile internal-test --no-wait
#
# Available profiles (see artifacts/calorie-tracker/eas.json):
#   development           — dev client, internal distribution, real device
#   development-simulator — dev client, iOS Simulator only (no Apple account needed)
#   preview               — internal distribution, production channel
#   production            — App Store / Google Play release, auto-increments version
#   internal-test         — internal iOS Release build for ad-hoc testing
#
# Prerequisites:
#   npm install -g eas-cli   (once per machine)
#   eas login                (once per machine)
# =============================================================================

set -euo pipefail

PLATFORM="ios"
PROFILE="development"
EXTRA_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --platform)
      PLATFORM="$2"
      shift 2
      ;;
    --profile)
      PROFILE="$2"
      shift 2
      ;;
    *)
      EXTRA_ARGS+=("$1")
      shift
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_DIR="$WORKSPACE_ROOT/artifacts/calorie-tracker"

if [[ ! -f "$APP_DIR/eas.json" ]]; then
  echo "ERROR: eas.json not found at $APP_DIR/eas.json"
  echo "Make sure you are running this script from the workspace root."
  exit 1
fi

echo "Building Calories Coach AI"
echo "  Platform : $PLATFORM"
echo "  Profile  : $PROFILE"
echo "  Directory: $APP_DIR"
echo ""

cd "$APP_DIR"
eas build --platform "$PLATFORM" --profile "$PROFILE" "${EXTRA_ARGS[@]}"
