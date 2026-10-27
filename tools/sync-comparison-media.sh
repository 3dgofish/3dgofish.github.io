#!/bin/bash
# Copy completed GOFish comparison media out of the read-only paper workspace.
# A video is published only when ffprobe can read it and its size stays fixed
# throughout the copy, so an encoder still writing a file cannot leak a partial
# MP4 into the website.

set -euo pipefail
shopt -s nullglob

SOURCE_DIR="${1:-/Users/allentu/efs/allentu/ICRA/GOFish_CVPR_2027/.videos}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SITE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
VIDEO_DIR="${SITE_DIR}/static/videos"
IMAGE_DIR="${SITE_DIR}/static/images/fiord"
FULLCIRCLE_IMAGE_DIR="${SITE_DIR}/static/images/fullcircle"
PAPER_DIR="$(cd "${SOURCE_DIR}/.." && pwd)"

# Source scene labels (official FIORD names; see check_corridor_labels).
SCENES=(
  Corridor_Out
  Building_In
  MeetingRoom_In
  Kitchen_In
  Hall_In
  Road_Out
  Bridge_Out
)

FULLCIRCLE_SCENES=(
  room2
  persons
  room3
  flat1
  lab
  dark
  room1
  flat2
  lounge
)

if [ ! -d "${SOURCE_DIR}" ]; then
  echo "Video source does not exist: ${SOURCE_DIR}" >&2
  exit 1
fi

if ! command -v ffprobe >/dev/null 2>&1; then
  echo "ffprobe is required to reject incomplete videos." >&2
  exit 1
fi

mkdir -p "${VIDEO_DIR}" "${IMAGE_DIR}" "${FULLCIRCLE_IMAGE_DIR}"

# Bridge_Out vs Corridor_Out: the source now uses the official FIORD labels
# (festia_out_corridor = Corridor_Out, outcorridor = Bridge_Out), the same as the
# site, so files are copied under their own names. The source files carry only
# scene labels, so the sync first proves the labels by the checksum of each
# scene's ground-truth frame and stops if they are ever swapped again.
FESTIA_OUT_CORRIDOR_GT_MD5="2c423bc00ed3fb6c3403e1d5240bdadc"   # Corridor_Out
OUTCORRIDOR_GT_MD5="df8ae721dd7b1de2f066b377cdf46d5e"           # Bridge_Out

md5_of() { md5 -q "$1" 2>/dev/null || md5sum "$1" | cut -d' ' -f1; }

check_corridor_labels() {
  local corridor bridge
  corridor="$(md5_of "${SOURCE_DIR}/Corridor_Out_gt.png" 2>/dev/null || true)"
  bridge="$(md5_of "${SOURCE_DIR}/Bridge_Out_gt.png" 2>/dev/null || true)"
  if [ "${corridor}" != "${FESTIA_OUT_CORRIDOR_GT_MD5}" ] || \
      [ "${bridge}" != "${OUTCORRIDOR_GT_MD5}" ]; then
    echo "Source Bridge_Out/Corridor_Out ground truth does not match the official" \
      "FIORD labels (Corridor_Out = festia_out_corridor). Refusing to sync." >&2
    exit 1
  fi
}

# Source size of every delivered file, so a file re-encoded for delivery
# (tools/compress-mesh-videos.sh) is not overwritten by its larger source again.
SOURCES_LIST="${SCRIPT_DIR}/media-sources.tsv"
recorded_source_size() { awk -F'\t' -v f="$1" '$1 == f { print $2 }' "${SOURCES_LIST}" 2>/dev/null; }
record_source_size() {
  local tmp="${SOURCES_LIST}.tmp"
  { awk -F'\t' -v f="$1" '$1 != f' "${SOURCES_LIST}" 2>/dev/null; printf '%s\t%s\n' "$1" "$2"; } | sort > "${tmp}"
  mv "${tmp}" "${SOURCES_LIST}"
}

file_size() {
  stat -f '%z' "$1" 2>/dev/null || stat -c '%s' "$1"
}

copy_ground_truth() {
  local source_path="$1"
  local output_name="$2"
  if [ ! -f "${source_path}" ]; then
    echo "Ground-truth still not ready: ${source_path}" >&2
    return
  fi
  cp "${source_path}" "${IMAGE_DIR}/${output_name}_gt.png"
}

check_corridor_labels

for scene in "${SCENES[@]}"; do
  copy_ground_truth "${SOURCE_DIR}/${scene}_gt.png" "${scene}"
done

copy_fullcircle_ground_truth() {
  local scene="$1"
  local source_path="${PAPER_DIR}/figures/app_qual_fc_surf/${scene}_gt.jpg"
  if [ ! -f "${source_path}" ]; then
    source_path="${PAPER_DIR}/figures/app_qual_render/fc_${scene}_gt.jpg"
  fi
  if [ ! -f "${source_path}" ]; then
    echo "FullCircle ground-truth still not ready: ${scene}" >&2
    return
  fi
  cp "${source_path}" "${FULLCIRCLE_IMAGE_DIR}/FullCircle_${scene}_gt.jpg"
}

for scene in "${FULLCIRCLE_SCENES[@]}"; do
  copy_fullcircle_ground_truth "${scene}"
done

copied=0
unchanged=0
deferred=0

sync_video() {
  local source_path="$1"
  local base_name
  local source_size_before
  local source_size_after
  local destination_path
  local temporary_path
  local temporary_size

  base_name="$(basename "${source_path}")"

  # The comparison intentionally uses the main GOFish result, never the
  # appearance-only ablation.
  if [[ "${base_name}" == *_gofish_appearance.mp4 ]]; then
    return
  fi
  # Stock 3DGRT (without PPISP) is not shown on the site.
  if [[ "${base_name}" == *_3dgrt.mp4 ]]; then
    return
  fi

  if ! ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 \
      "${source_path}" >/dev/null 2>&1; then
    echo "Deferred incomplete video: ${base_name}"
    deferred=$((deferred + 1))
    return
  fi

  source_size_before="$(file_size "${source_path}")"
  destination_path="${VIDEO_DIR}/${base_name}"
  temporary_path="${VIDEO_DIR}/.${base_name}.syncing"

  if [ -f "${destination_path}" ] && \
      { [ "$(file_size "${destination_path}")" = "${source_size_before}" ] || \
        [ "$(recorded_source_size "${base_name}")" = "${source_size_before}" ]; }; then
    unchanged=$((unchanged + 1))
    return
  fi

  cp "${source_path}" "${temporary_path}"
  source_size_after="$(file_size "${source_path}")"
  temporary_size="$(file_size "${temporary_path}")"

  if [ "${source_size_before}" != "${source_size_after}" ] || \
      [ "${source_size_after}" != "${temporary_size}" ]; then
    rm -f "${temporary_path}"
    echo "Deferred changing video: ${base_name}"
    deferred=$((deferred + 1))
    return
  fi

  mv "${temporary_path}" "${destination_path}"
  record_source_size "${base_name}" "${source_size_after}"
  echo "Copied ${base_name}"
  case "${base_name}" in *_mesh.mp4) echo "  (run tools/compress-mesh-videos.sh before committing)" ;; esac
  copied=$((copied + 1))
}

for scene in "${SCENES[@]}"; do
  for source_path in "${SOURCE_DIR}/${scene}_"*.mp4; do
    sync_video "${source_path}"
  done
done

for scene in "${FULLCIRCLE_SCENES[@]}"; do
  for source_path in "${SOURCE_DIR}/FullCircle_${scene}_"*.mp4; do
    sync_video "${source_path}"
  done
done

for source_path in "${SOURCE_DIR}/sim_gofish.mp4" "${SOURCE_DIR}/sim_3dgut.mp4"; do
  if [ -f "${source_path}" ]; then
    sync_video "${source_path}"
  fi
done

echo "Comparison media sync complete: ${copied} copied, ${unchanged} unchanged, ${deferred} deferred."
