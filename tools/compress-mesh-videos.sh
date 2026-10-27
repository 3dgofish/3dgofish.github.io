#!/bin/bash
# Re-encode the heavy mesh-normal clips at a delivery bitrate.
#
# Mesh normal renders are high-entropy and were exported near-lossless (16-28
# Mbps), which made the default results-viewer selection download ~50 MB. These
# settings were checked by eye on Hall_In (indistinguishable at 100%) and cut
# H.264 by ~3x and AV1 by ~2x. A file is replaced only when the new encode is at
# least 20% smaller, so already-light clips are left untouched.
#
# Usage: tools/compress-mesh-videos.sh [glob]   (default: static/videos/*_mesh.mp4)

set -euo pipefail
SITE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VIDEOS="$SITE_DIR/static/videos"
H264_CRF="${H264_CRF:-23}"
H264_MAXRATE="${H264_MAXRATE:-8M}"
AV1_CRF="${AV1_CRF:-40}"

replace_if_smaller() {  # tmp target
  local new old
  new=$(stat -f %z "$1"); old=$(stat -f %z "$2")
  if [ "$new" -lt $((old * 8 / 10)) ]; then
    mv "$1" "$2"; echo "  $(basename "$2"): $old -> $new"
  else
    rm -f "$1"; echo "  $(basename "$2"): kept ($old)"
  fi
}

shopt -s nullglob
for src in ${1:-"$VIDEOS"/*_mesh.mp4}; do
  case "$src" in *.av1.mp4|*social*) continue ;; esac
  base="${src%.mp4}"
  echo "$(basename "$src")"
  # Encode both outputs from the current H.264 file before replacing either.
  ffmpeg -hide_banner -loglevel error -y -i "$src" -an \
    -c:v libx264 -preset slow -crf "$H264_CRF" -maxrate "$H264_MAXRATE" -bufsize 16M \
    -pix_fmt yuv420p -g 60 -movflags +faststart "$VIDEOS/.tmp.h264.mp4"
  if [ -f "$base.av1.mp4" ]; then
    ffmpeg -hide_banner -loglevel error -y -i "$src" -an \
      -c:v libsvtav1 -preset 6 -crf "$AV1_CRF" -svtav1-params tune=0 \
      -pix_fmt yuv420p -g 120 -tag:v av01 -movflags +faststart "$VIDEOS/.tmp.av1.mp4" 2>/dev/null
    replace_if_smaller "$VIDEOS/.tmp.av1.mp4" "$base.av1.mp4"
  fi
  replace_if_smaller "$VIDEOS/.tmp.h264.mp4" "$src"
done
