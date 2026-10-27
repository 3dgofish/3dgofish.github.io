#!/bin/bash
# Build a seamless Hall_In GOFish-vs-3DGUT+PPISP social wipe at 1600x1066.
#
# Usage:
#   static/videos/generate-social-building.sh [gofish.mp4] [baseline.mp4] [mesh.mp4] [output.mp4]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
# Keep the established output names stable for existing social-package links,
# while sourcing the current Hall teaser footage.
GOFISH="${1:-$ROOT/static/videos/Hall_In_gofish_ours.mp4}"
BASELINE="${2:-$ROOT/static/videos/Hall_In_3dgut_ppisp.mp4}"
MESH="${3:-$ROOT/static/videos/Hall_In_gofish_mesh.mp4}"
OUTPUT="${4:-$SCRIPT_DIR/gofish_building_social_combined.mp4}"
OUTPUT_STEM="${OUTPUT%.mp4}"
RENDER_ONLY="${OUTPUT_STEM%_combined}_render.mp4"
MESH_ONLY="${OUTPUT_STEM%_combined}_mesh.mp4"
RENDER_LABELS="$ROOT/static/images/social/gofish-building-sweep-labels.svg"
MESH_LABELS="$ROOT/static/images/social/gofish-building-mesh-labels.svg"
ICON="$ROOT/static/images/gofish-logo.svg"
POSTER="${OUTPUT%.mp4}_poster.jpg"
RENDER_POSTER="${RENDER_ONLY%.mp4}_poster.jpg"
MESH_POSTER="${MESH_ONLY%.mp4}_poster.jpg"
OUT_WIDTH=1600
OUT_HEIGHT=1066
HALF_WIDTH=$(( OUT_WIDTH / 2 ))
PAD_X=$(( (OUT_WIDTH - OUT_HEIGHT) / 2 ))
LINE_WIDTH="${LINE_WIDTH:-8}"
CYCLES="${CYCLES:-2}"
CRF="${CRF:-17}"
PRESET="${PRESET:-slow}"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/gofish-social-sweep.XXXXXX")"

trap 'rm -rf "$TEMP_DIR"' EXIT

command -v ffmpeg >/dev/null || { echo "ffmpeg not found" >&2; exit 1; }
command -v ffprobe >/dev/null || { echo "ffprobe not found" >&2; exit 1; }
command -v rsvg-convert >/dev/null || { echo "rsvg-convert not found" >&2; exit 1; }

video_signature() {
  ffprobe -v error -select_streams v:0 -count_frames \
    -show_entries stream=width,height,r_frame_rate,nb_read_frames \
    -of csv=p=0 "$1"
}

expected="$(video_signature "$GOFISH")"
actual="$(video_signature "$BASELINE")"
mesh_actual="$(video_signature "$MESH")"
if [ "$expected" != "$actual" ] || [ "$expected" != "$mesh_actual" ]; then
  echo "All three input videos must have identical dimensions, frame rates, and frame counts." >&2
  echo "GOFish:        $expected" >&2
  echo "3DGUT + PPISP: $actual" >&2
  echo "GOFish Mesh:   $mesh_actual" >&2
  exit 1
fi

frame_rate="$(ffprobe -v error -select_streams v:0 \
  -show_entries stream=r_frame_rate -of default=nw=1:nk=1 "$GOFISH")"
frame_count="$(ffprobe -v error -select_streams v:0 -count_frames \
  -show_entries stream=nb_read_frames -of default=nw=1:nk=1 "$GOFISH")"
duration="$(awk -v frames="$frame_count" -v rate="$frame_rate" '
  BEGIN { split(rate, parts, "/"); printf "%.9f", frames * parts[2] / parts[1] }
')"
total_duration="$(awk -v duration="$duration" 'BEGIN { printf "%.9f", 2 * duration }')"
total_frames=$((2 * frame_count))
wipe_period="$(awk -v duration="$duration" -v cycles="$CYCLES" \
  'BEGIN { printf "%.9f", duration / cycles }')"
fade_in_end="$(awk -v duration="$duration" 'BEGIN { printf "%.9f", duration + 1 }')"
fade_back_start="$(awk -v duration="$duration" 'BEGIN { printf "%.9f", 2 * duration - 1 }')"

mkdir -p "$(dirname "$OUTPUT")"
rsvg-convert -w "$OUT_WIDTH" -h "$OUT_HEIGHT" "$RENDER_LABELS" \
  -o "$TEMP_DIR/render-labels.png"
rsvg-convert -w "$OUT_WIDTH" -h "$OUT_HEIGHT" "$MESH_LABELS" \
  -o "$TEMP_DIR/mesh-labels.png"
rsvg-convert -w 220 -h 220 "$ICON" -o "$TEMP_DIR/icon.png"
ffmpeg -nostdin -y -v error -i "$TEMP_DIR/render-labels.png" -i "$TEMP_DIR/icon.png" \
  -filter_complex '[0:v][1:v]overlay=3:718:format=auto[out]' -map '[out]' \
  -frames:v 1 -pix_fmt rgba "$TEMP_DIR/render-overlay.png"

# The first source-path loop is a moving GOFish/3DGUT comparison. The second is
# a fixed centre split whose right half fades baseline -> mesh -> baseline. At
# 20 seconds, source time, divider position, right content, and label opacity all
# match frame zero. Labels crossfade with the content and are overlaid last,
# above both the wipe and divider.
right_mix="if(lt(T,${duration}),0,if(lt(T,${fade_in_end}),T-${duration},if(lt(T,${fade_back_start}),1,${total_duration}-T)))"
filter="[0:v]scale=${OUT_HEIGHT}:${OUT_HEIGHT}:flags=lanczos,pad=${OUT_WIDTH}:${OUT_HEIGHT}:${PAD_X}:0:color=black,setpts=PTS-STARTPTS,split=2[gofish_sweep][gofish_mesh];[1:v]scale=${OUT_HEIGHT}:${OUT_HEIGHT}:flags=lanczos,pad=${OUT_WIDTH}:${OUT_HEIGHT}:${PAD_X}:0:color=black,setpts=PTS-STARTPTS,split=2[baseline_sweep][baseline_mix];[2:v]scale=${OUT_HEIGHT}:${OUT_HEIGHT}:flags=lanczos,pad=${OUT_WIDTH}:${OUT_HEIGHT}:${PAD_X}:0:color=black,setpts=PTS-STARTPTS[mesh];[gofish_sweep][baseline_sweep]blend=all_expr='if(lte(X,W/2+${OUT_HEIGHT}/2*sin(2*PI*T/${wipe_period})),A,B)'[swept];[baseline_mix][mesh]blend=all_expr='A*(1-(${right_mix}))+B*(${right_mix})'[right_mix_video];[gofish_mesh][right_mix_video]blend=all_expr='if(lte(X,W/2),A,B)'[mesh_phase];[swept][mesh_phase]blend=all_expr='if(lt(T,${duration}),A,B)'[program];color=c=white:s=${LINE_WIDTH}x${OUT_HEIGHT}:r=${frame_rate}:d=${total_duration}[line];[program][line]overlay=x='if(lt(t,${duration}),W/2+${OUT_HEIGHT}/2*sin(2*PI*t/${wipe_period}),W/2)-${LINE_WIDTH}/2':y=0:shortest=1[lined];[3:v]format=rgba,split=3[left_source][render_start_source][render_end_source];[left_source]crop=${HALF_WIDTH}:${OUT_HEIGHT}:0:0,trim=duration=${total_duration},setpts=PTS-STARTPTS[left_labels];[render_start_source]crop=${HALF_WIDTH}:${OUT_HEIGHT}:${HALF_WIDTH}:0,trim=duration=${fade_in_end},setpts=PTS-STARTPTS,fade=t=out:st=${duration}:d=1:alpha=1[render_start];color=c=black@0.0:s=${HALF_WIDTH}x${OUT_HEIGHT}:r=${frame_rate}:d=8,format=rgba[render_gap];[render_end_source]crop=${HALF_WIDTH}:${OUT_HEIGHT}:${HALF_WIDTH}:0,trim=duration=1,setpts=PTS-STARTPTS,fade=t=in:st=0:d=1:alpha=1[render_end];[render_start][render_gap][render_end]concat=n=3:v=1:a=0[render_labels];[4:v]format=rgba,crop=${HALF_WIDTH}:${OUT_HEIGHT}:${HALF_WIDTH}:0,trim=duration=${total_duration},setpts=PTS-STARTPTS,fade=t=in:st=${duration}:d=1:alpha=1,fade=t=out:st=${fade_back_start}:d=1:alpha=1[mesh_labels];[lined][left_labels]overlay=0:0:shortest=1[left_labeled];[left_labeled][render_labels]overlay=${HALF_WIDTH}:0:shortest=1[render_labeled];[render_labeled][mesh_labels]overlay=${HALF_WIDTH}:0:shortest=1[out]"

ffmpeg -nostdin -y -v error \
  -stream_loop 1 -i "$GOFISH" -stream_loop 1 -i "$BASELINE" -stream_loop 1 -i "$MESH" \
  -loop 1 -framerate "$frame_rate" -i "$TEMP_DIR/render-overlay.png" \
  -loop 1 -framerate "$frame_rate" -i "$TEMP_DIR/mesh-labels.png" \
  -filter_complex "$filter" -map '[out]' -frames:v "$total_frames" -an \
  -c:v libx264 -crf "$CRF" -preset "$PRESET" -profile:v high \
  -pix_fmt yuv420p -movflags +faststart -map_metadata -1 "$OUTPUT"

ffmpeg -nostdin -y -v error -ss 0.75 -i "$OUTPUT" \
  -frames:v 1 -q:v 3 "$POSTER"

# Standalone render comparison: the first ten-second sweep with no transition.
render_filter="[0:v]scale=${OUT_HEIGHT}:${OUT_HEIGHT}:flags=lanczos,pad=${OUT_WIDTH}:${OUT_HEIGHT}:${PAD_X}:0:color=black,setpts=PTS-STARTPTS[gofish];[1:v]scale=${OUT_HEIGHT}:${OUT_HEIGHT}:flags=lanczos,pad=${OUT_WIDTH}:${OUT_HEIGHT}:${PAD_X}:0:color=black,setpts=PTS-STARTPTS[baseline];[gofish][baseline]blend=all_expr='if(lte(X,W/2+${OUT_HEIGHT}/2*sin(2*PI*T/${wipe_period})),A,B)'[swept];color=c=white:s=${LINE_WIDTH}x${OUT_HEIGHT}:r=${frame_rate}:d=${duration}[line];[swept][line]overlay=x='W/2+${OUT_HEIGHT}/2*sin(2*PI*t/${wipe_period})-${LINE_WIDTH}/2':y=0:shortest=1[lined];[lined][2:v]overlay=0:0:shortest=1[out]"
ffmpeg -nostdin -y -v error \
  -i "$GOFISH" -i "$BASELINE" \
  -loop 1 -framerate "$frame_rate" -i "$TEMP_DIR/render-overlay.png" \
  -filter_complex "$render_filter" -map '[out]' -frames:v "$frame_count" -an \
  -c:v libx264 -crf "$CRF" -preset "$PRESET" -profile:v high \
  -pix_fmt yuv420p -movflags +faststart -map_metadata -1 "$RENDER_ONLY"

# Standalone geometry comparison: a fixed centre split with no transition.
mesh_filter="[0:v]scale=${OUT_HEIGHT}:${OUT_HEIGHT}:flags=lanczos,pad=${OUT_WIDTH}:${OUT_HEIGHT}:${PAD_X}:0:color=black,setpts=PTS-STARTPTS[gofish];[1:v]scale=${OUT_HEIGHT}:${OUT_HEIGHT}:flags=lanczos,pad=${OUT_WIDTH}:${OUT_HEIGHT}:${PAD_X}:0:color=black,setpts=PTS-STARTPTS[mesh];[gofish][mesh]blend=all_expr='if(lte(X,W/2),A,B)'[split];color=c=white:s=${LINE_WIDTH}x${OUT_HEIGHT}:r=${frame_rate}:d=${duration}[line];[split][line]overlay=x='W/2-${LINE_WIDTH}/2':y=0:shortest=1[lined];[2:v]format=rgba,crop=${HALF_WIDTH}:${OUT_HEIGHT}:0:0[left_labels];[3:v]format=rgba,crop=${HALF_WIDTH}:${OUT_HEIGHT}:${HALF_WIDTH}:0[mesh_labels];[lined][left_labels]overlay=0:0:shortest=1[left_labeled];[left_labeled][mesh_labels]overlay=${HALF_WIDTH}:0:shortest=1[out]"
ffmpeg -nostdin -y -v error \
  -i "$GOFISH" -i "$MESH" \
  -loop 1 -framerate "$frame_rate" -i "$TEMP_DIR/render-overlay.png" \
  -loop 1 -framerate "$frame_rate" -i "$TEMP_DIR/mesh-labels.png" \
  -filter_complex "$mesh_filter" -map '[out]' -frames:v "$frame_count" -an \
  -c:v libx264 -crf "$CRF" -preset "$PRESET" -profile:v high \
  -pix_fmt yuv420p -movflags +faststart -map_metadata -1 "$MESH_ONLY"

ffmpeg -nostdin -y -v error -ss 0.75 -i "$RENDER_ONLY" \
  -frames:v 1 -q:v 3 "$RENDER_POSTER"
ffmpeg -nostdin -y -v error -ss 0.75 -i "$MESH_ONLY" \
  -frames:v 1 -q:v 3 "$MESH_POSTER"

output_signature="$(video_signature "$OUTPUT")"
expected_output="${OUT_WIDTH},${OUT_HEIGHT},${frame_rate},${total_frames}"
if [ "$output_signature" != "$expected_output" ]; then
  echo "Output validation failed." >&2
  echo "expected: $expected_output" >&2
  echo "actual:   $output_signature" >&2
  exit 1
fi

expected_standalone="${OUT_WIDTH},${OUT_HEIGHT},${frame_rate},${frame_count}"
for standalone in "$RENDER_ONLY" "$MESH_ONLY"; do
  standalone_signature="$(video_signature "$standalone")"
  if [ "$standalone_signature" != "$expected_standalone" ]; then
    echo "Standalone validation failed: $standalone" >&2
    echo "expected: $expected_standalone" >&2
    echo "actual:   $standalone_signature" >&2
    exit 1
  fi
done

echo "Wrote $OUTPUT"
echo "Wrote $POSTER"
echo "Wrote $RENDER_ONLY"
echo "Wrote $RENDER_POSTER"
echo "Wrote $MESH_ONLY"
echo "Wrote $MESH_POSTER"
echo "Sweep: $CYCLES cycles over ${duration}s; mesh phase returns by ${total_duration}s"
