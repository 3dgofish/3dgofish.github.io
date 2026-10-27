#!/bin/bash
# Build compact AVIF/WebP images for the FIORD and FullCircle scene rails.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SITE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
THUMBNAIL_SIZE="${THUMBNAIL_SIZE:-192}"

for command_name in avifenc cwebp ffmpeg ffprobe; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "${command_name} is required." >&2
    exit 1
  fi
done

build_thumbnail() {
  local source="$1"
  local stem="${source%.*}"
  local avif_output="${stem}-thumb.avif"
  local webp_output="${stem}-thumb.webp"
  local signature

  ffmpeg -nostdin -v error -i "${source}" -frames:v 1 \
    -vf "scale=${THUMBNAIL_SIZE}:${THUMBNAIL_SIZE}:flags=lanczos" \
    -pix_fmt yuv420p -f yuv4mpegpipe - | \
    avifenc -q 55 -s 6 -j all --creation-time 0 --modification-time 0 \
      --ignore-exif --ignore-xmp --ignore-icc --stdin \
      "${avif_output}" >/dev/null

  cwebp -quiet -mt -m 6 -q 82 -sharp_yuv \
    -resize "${THUMBNAIL_SIZE}" "${THUMBNAIL_SIZE}" \
    "${source}" -o "${webp_output}"

  for output in "${avif_output}" "${webp_output}"; do
    signature="$(ffprobe -v error -select_streams v:0 \
      -show_entries stream=width,height -of csv=p=0 "${output}")"
    if [ "${signature}" != "${THUMBNAIL_SIZE},${THUMBNAIL_SIZE}" ]; then
      echo "Thumbnail validation failed: ${output} (${signature})" >&2
      exit 1
    fi
  done

  echo "Built ${avif_output#"${SITE_DIR}/"} and ${webp_output#"${SITE_DIR}/"}."
}

while IFS= read -r -d '' source; do
  build_thumbnail "${source}"
done < <(find "${SITE_DIR}/static/images/fiord" -maxdepth 1 -type f \
  -name '*_gt.png' -print0 | sort -z)

while IFS= read -r -d '' source; do
  build_thumbnail "${source}"
done < <(find "${SITE_DIR}/static/images/fullcircle" -maxdepth 1 -type f \
  -name '*_gt.jpg' -print0 | sort -z)

echo "Built validated ${THUMBNAIL_SIZE}px scene-rail thumbnails."
