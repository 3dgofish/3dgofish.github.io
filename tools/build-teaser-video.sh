#!/bin/bash
# Pack the Hall_In teaser sources into one three-column playback clock.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SITE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
VIDEO_DIR="${SITE_DIR}/static/videos"
IMAGE_DIR="${SITE_DIR}/static/images/fiord"
OUTPUT_VIDEO="${VIDEO_DIR}/teaser-hall-in-3way.mp4"
OUTPUT_MOBILE="${VIDEO_DIR}/teaser-hall-in-3way-mobile.mp4"
MASTER_DIR="$(mktemp -d /tmp/gofish-teaser.XXXXXX)"
MASTER_VIDEO="${MASTER_DIR}/teaser-hall-in-3way-master.mp4"
trap 'rm -rf "${MASTER_DIR}"' EXIT
OUTPUT_POSTER="${IMAGE_DIR}/teaser-hall-in-poster.jpg"
OUTPUT_SIM_VIDEO="${VIDEO_DIR}/teaser-simulation-2way.mp4"
OUTPUT_SIM_POSTER="${IMAGE_DIR}/teaser-simulation-poster.jpg"

for input_path in \
  "${VIDEO_DIR}/Hall_In_gofish_ours.mp4" \
  "${VIDEO_DIR}/Hall_In_gofish_mesh.mp4" \
  "${VIDEO_DIR}/Hall_In_3dgut_ppisp.mp4" \
  "${VIDEO_DIR}/sim_gofish.mp4" \
  "${VIDEO_DIR}/sim_3dgut.mp4"; do
  if [ ! -f "${input_path}" ]; then
    echo "Missing teaser input: ${input_path}" >&2
    exit 1
  fi
done

ffmpeg -hide_banner -loglevel warning -y \
  -i "${VIDEO_DIR}/Hall_In_gofish_ours.mp4" \
  -i "${VIDEO_DIR}/Hall_In_gofish_mesh.mp4" \
  -i "${VIDEO_DIR}/Hall_In_3dgut_ppisp.mp4" \
  -filter_complex \
  '[0:v]setpts=PTS-STARTPTS[g];[1:v]setpts=PTS-STARTPTS[m];[2:v]setpts=PTS-STARTPTS[b];[g][m][b]hstack=inputs=3[v]' \
  -map '[v]' -an -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p \
  -movflags +faststart "${MASTER_VIDEO}"

# Delivery encodes. The 2448 px master (three 816 px panels) was 25-39 MB and
# preloaded on every visit; 1920 px desktop and 1224 px mobile (<= 768 px
# viewports, via <source media>) keep each panel sharp at its displayed size.
encode_delivery() {  # width output h264_crf h264_maxrate av1_crf
  ffmpeg -hide_banner -loglevel warning -y -i "${MASTER_VIDEO}" -an \
    -vf "scale=$1:-2:flags=lanczos" -c:v libx264 -preset slow -crf "$3" \
    -maxrate "$4" -bufsize 16M -pix_fmt yuv420p -g 60 -movflags +faststart "$2"
  ffmpeg -hide_banner -loglevel warning -y -i "${MASTER_VIDEO}" -an \
    -vf "scale=$1:-2:flags=lanczos" -c:v libsvtav1 -preset 6 -crf "$5" \
    -svtav1-params tune=0 -pix_fmt yuv420p -g 120 -tag:v av01 \
    -movflags +faststart "${2%.mp4}.av1.mp4"
}
encode_delivery 1920 "${OUTPUT_VIDEO}" 22 8M 36
encode_delivery 1224 "${OUTPUT_MOBILE}" 24 3M 38

# The initial 50/50 divider view: GOFish render over mesh on the left and the
# baseline on the right. Each crop is the matching region of its full frame.
ffmpeg -hide_banner -loglevel warning -y -ss 0.8 -i "${MASTER_VIDEO}" \
  -filter_complex \
  '[0:v]crop=408:408:0:0[tl];[0:v]crop=408:408:816:408[bl];[0:v]crop=408:816:2040:0[r];[tl][bl]vstack=inputs=2[left];[left][r]hstack=inputs=2[poster]' \
  -map '[poster]' -frames:v 1 -update 1 -q:v 2 "${OUTPUT_POSTER}"

ffmpeg -hide_banner -loglevel warning -y \
  -i "${VIDEO_DIR}/sim_gofish.mp4" \
  -i "${VIDEO_DIR}/sim_3dgut.mp4" \
  -filter_complex \
  '[0:v]setpts=PTS-STARTPTS[g];[1:v]setpts=PTS-STARTPTS[b];[g][b]hstack=inputs=2[v]' \
  -map '[v]' -an -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p \
  -movflags +faststart "${OUTPUT_SIM_VIDEO}"

ffmpeg -hide_banner -loglevel warning -y -ss 0.8 -i "${OUTPUT_SIM_VIDEO}" \
  -filter_complex \
  '[0:v]crop=408:816:0:0[left];[0:v]crop=408:816:1224:0[right];[left][right]hstack=inputs=2[poster]' \
  -map '[poster]' -frames:v 1 -update 1 -q:v 2 "${OUTPUT_SIM_POSTER}"

echo "Built both packed teaser videos and posters."
