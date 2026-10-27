#!/bin/bash
# Build AV1 web-delivery copies while preserving the H.264 masters verbatim.
#
# Published layout:
#   <name>.av1.mp4  preferred compact AV1 delivery file
#   <name>.mp4      untouched H.264 compatibility master
#
# Usage:
#   tools/build-media.sh [name ...]
#   JOBS=2 FORCE=1 tools/build-media.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VIDEOS="$ROOT/static/videos"
JOBS="${JOBS:-2}"
FORCE="${FORCE:-0}"
AV1_CRF="${AV1_CRF:-32}"
AV1_PRESET="${AV1_PRESET:-6}"

command -v ffmpeg >/dev/null || { echo "ffmpeg not found" >&2; exit 1; }
command -v ffprobe >/dev/null || { echo "ffprobe not found" >&2; exit 1; }
case "$JOBS" in *[!0-9]*|'') echo "JOBS must be a positive integer" >&2; exit 1;; esac
[ "$JOBS" -gt 0 ] || { echo "JOBS must be a positive integer" >&2; exit 1; }

collect_masters() {
  find "$VIDEOS" -maxdepth 1 -type f -name "*.mp4" \
    ! -name ".*.av1.tmp.mp4" \
    ! -name "*.av1.mp4" ! -name "*.web.mp4" ! -name "*_compressed.mp4" \
    ! -name "sim_gofish.mp4" ! -name "sim_3dgut.mp4" | sort
}

video_signature() {
  ffprobe -v error -select_streams v:0 \
    -show_entries stream=width,height,r_frame_rate -show_entries format=duration \
    -of csv=p=0 "$1"
}

file_size() {
  stat -f '%z' "$1" 2>/dev/null || stat -c '%s' "$1"
}

encode_one() {
  local src="$1"
  local base out tmp source_signature output_signature codec original_size delivery_size
  base="$(basename "$src" .mp4)"
  out="$VIDEOS/$base.av1.mp4"
  tmp="$VIDEOS/.$base.av1.tmp.mp4"

  if [ "$FORCE" != "1" ] && [ -f "$out" ]; then
    echo "skip $base (delivery copy already exists; use FORCE=1 to rebuild)"
    return
  fi

  rm -f "$tmp"
  trap 'rm -f "$tmp"' EXIT
  echo "encode $base"
  ffmpeg -nostdin -y -v error -i "$src" -map 0:v:0 -an \
    -c:v libsvtav1 -preset "$AV1_PRESET" -crf "$AV1_CRF" \
    -svtav1-params tune=0 -pix_fmt yuv420p -g 120 -tag:v av01 \
    -movflags +faststart -map_metadata -1 "$tmp"

  source_signature="$(video_signature "$src")"
  output_signature="$(video_signature "$tmp")"
  codec="$(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name \
    -of default=nw=1:nk=1 "$tmp")"
  if [ "$codec" != "av1" ] || [ "$source_signature" != "$output_signature" ]; then
    echo "validation failed: $base" >&2
    echo "source: $source_signature" >&2
    echo "output: $output_signature ($codec)" >&2
    exit 1
  fi

  mv "$tmp" "$out"
  trap - EXIT
  original_size="$(file_size "$src")"
  delivery_size="$(file_size "$out")"
  awk -v name="$base" -v original="$original_size" -v delivery="$delivery_size" \
    'BEGIN { printf "done   %-42s %6.1f -> %6.1f MiB (%3.0f%%)\n", name, original/1048576, delivery/1048576, 100*delivery/original }'
}

if [ "$#" -gt 0 ]; then
  MASTERS=()
  for name in "$@"; do MASTERS+=("$VIDEOS/${name%.mp4}.mp4"); done
else
  MASTERS=()
  while IFS= read -r path; do MASTERS+=("$path"); done < <(collect_masters)
fi

for src in "${MASTERS[@]}"; do
  [ -f "$src" ] || { echo "missing master: $src" >&2; exit 1; }
done

echo "Building ${#MASTERS[@]} AV1 delivery files with $JOBS concurrent job(s)."
for ((offset=0; offset<${#MASTERS[@]}; offset+=JOBS)); do
  pids=()
  for ((index=offset; index<offset+JOBS && index<${#MASTERS[@]}; index++)); do
    encode_one "${MASTERS[$index]}" &
    pids+=("$!")
  done
  for pid in "${pids[@]}"; do wait "$pid"; done
done

master_bytes=0
delivery_bytes=0
for src in "${MASTERS[@]}"; do
  base="$(basename "$src" .mp4)"
  master_bytes=$((master_bytes + $(file_size "$src")))
  delivery_bytes=$((delivery_bytes + $(file_size "$VIDEOS/$base.av1.mp4")))
done
awk -v original="$master_bytes" -v delivery="$delivery_bytes" \
  'BEGIN { printf "AV1 delivery total: %.1f MiB from %.1f MiB of masters (%.0f%%).\n", delivery/1048576, original/1048576, 100*delivery/original }'
