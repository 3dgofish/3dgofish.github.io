#!/bin/bash
# Build the single-scene GOFish simulation teaser at Speedy-Splat's 1600x1066 ratio.
#
# Usage:
#   static/videos/generate-social-simulation.sh [output.mp4]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SOURCE="$ROOT/static/videos/sim_gofish.mp4"
OUTPUT="${1:-$SCRIPT_DIR/gofish_simulation_solo.mp4}"
LABELS="$ROOT/static/images/social/gofish-simulation-labels.svg"
ICON="$ROOT/static/images/gofish-logo.svg"
POSTER="${OUTPUT%.mp4}_poster.jpg"
OUT_WIDTH=1600
OUT_HEIGHT=1066
PAD_X=$(( (OUT_WIDTH - OUT_HEIGHT) / 2 ))
CRF="${CRF:-17}"
PRESET="${PRESET:-slow}"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/gofish-social-simulation.XXXXXX")"

trap 'rm -rf "$TEMP_DIR"' EXIT

command -v ffmpeg >/dev/null || { echo "ffmpeg not found" >&2; exit 1; }
command -v ffprobe >/dev/null || { echo "ffprobe not found" >&2; exit 1; }
command -v rsvg-convert >/dev/null || { echo "rsvg-convert not found" >&2; exit 1; }
[ -f "$SOURCE" ] || { echo "Simulation source not found: $SOURCE" >&2; exit 1; }

frame_rate="$(ffprobe -v error -select_streams v:0 \
  -show_entries stream=r_frame_rate -of default=nw=1:nk=1 "$SOURCE")"
frame_count="$(ffprobe -v error -select_streams v:0 -count_frames \
  -show_entries stream=nb_read_frames -of default=nw=1:nk=1 "$SOURCE")"

mkdir -p "$(dirname "$OUTPUT")"
rsvg-convert -w "$OUT_WIDTH" -h "$OUT_HEIGHT" "$LABELS" \
  -o "$TEMP_DIR/labels.png"
rsvg-convert -w 220 -h 220 "$ICON" -o "$TEMP_DIR/icon.png"
ffmpeg -nostdin -y -v error -i "$TEMP_DIR/labels.png" -i "$TEMP_DIR/icon.png" \
  -filter_complex '[0:v][1:v]overlay=3:718:format=auto[out]' -map '[out]' \
  -frames:v 1 -pix_fmt rgba "$TEMP_DIR/overlay.png"

ffmpeg -nostdin -y -v error -i "$SOURCE" \
  -loop 1 -framerate "$frame_rate" -i "$TEMP_DIR/overlay.png" \
  -filter_complex "[0:v]scale=${OUT_HEIGHT}:${OUT_HEIGHT}:flags=lanczos,pad=${OUT_WIDTH}:${OUT_HEIGHT}:${PAD_X}:0:color=black,setsar=1[video];[video][1:v]overlay=0:0:shortest=1,crop=${OUT_WIDTH}:${OUT_HEIGHT}:0:0[out]" \
  -map '[out]' -frames:v "$frame_count" -an \
  -c:v libx264 -crf "$CRF" -preset "$PRESET" -profile:v high \
  -pix_fmt yuv420p -movflags +faststart -map_metadata -1 "$OUTPUT"

ffmpeg -nostdin -y -v error -ss 0.75 -i "$OUTPUT" \
  -frames:v 1 -q:v 3 "$POSTER"

signature="$(ffprobe -v error -select_streams v:0 -count_frames \
  -show_entries stream=width,height,r_frame_rate,nb_read_frames \
  -of csv=p=0 "$OUTPUT")"
expected="${OUT_WIDTH},${OUT_HEIGHT},${frame_rate},${frame_count}"
if [ "$signature" != "$expected" ]; then
  echo "Output validation failed." >&2
  echo "expected: $expected" >&2
  echo "actual:   $signature" >&2
  exit 1
fi

echo "Wrote $OUTPUT"
echo "Wrote $POSTER"
