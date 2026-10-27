#!/bin/bash
# Join the three finalized GOFish social clips with seamless cyclic crossfades.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RENDER="$SCRIPT_DIR/gofish_building_social_render.mp4"
MESH="$SCRIPT_DIR/gofish_building_social_mesh.mp4"
SIMULATION="$SCRIPT_DIR/gofish_simulation_solo.mp4"
OUTPUT="${1:-$SCRIPT_DIR/gofish_social_all_three.mp4}"
POSTER="${OUTPUT%.mp4}_poster.jpg"
FADE_DURATION="${FADE_DURATION:-1}"
CRF="${CRF:-15}"
PRESET="${PRESET:-slow}"

command -v ffmpeg >/dev/null || { echo "ffmpeg not found" >&2; exit 1; }
command -v ffprobe >/dev/null || { echo "ffprobe not found" >&2; exit 1; }

for input in "$RENDER" "$MESH" "$SIMULATION"; do
  [ -f "$input" ] || { echo "Missing social clip: $input" >&2; exit 1; }
done

video_signature() {
  ffprobe -v error -select_streams v:0 -count_frames \
    -show_entries stream=width,height,r_frame_rate,nb_read_frames \
    -of csv=p=0 "$1"
}

render_signature="$(video_signature "$RENDER")"
mesh_signature="$(video_signature "$MESH")"
simulation_signature="$(video_signature "$SIMULATION")"
render_format="$(printf '%s' "$render_signature" | cut -d, -f1-3)"
mesh_format="$(printf '%s' "$mesh_signature" | cut -d, -f1-3)"
simulation_format="$(printf '%s' "$simulation_signature" | cut -d, -f1-3)"
if [ "$render_format" != "$mesh_format" ] || [ "$render_format" != "$simulation_format" ]; then
  echo "All three clips must have identical dimensions and frame rates." >&2
  echo "render:     $render_signature" >&2
  echo "mesh:       $mesh_signature" >&2
  echo "simulation: $simulation_signature" >&2
  exit 1
fi

render_duration="$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$RENDER")"
mesh_duration="$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$MESH")"
simulation_duration="$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$SIMULATION")"
render_to_mesh="$(awk -v d="$render_duration" -v f="$FADE_DURATION" 'BEGIN { printf "%.9f", d - f }')"
mesh_to_simulation="$(awk -v r="$render_duration" -v m="$mesh_duration" -v f="$FADE_DURATION" 'BEGIN { printf "%.9f", r + m - 2 * f }')"
simulation_to_render="$(awk -v r="$render_duration" -v m="$mesh_duration" -v s="$simulation_duration" -v f="$FADE_DURATION" 'BEGIN { printf "%.9f", r + m + s - 3 * f }')"
total_duration="$(awk -v r="$render_duration" -v m="$mesh_duration" -v s="$simulation_duration" -v f="$FADE_DURATION" 'BEGIN { printf "%.9f", r + m + s - 2 * f }')"
render_tail_start="$(awk -v d="$render_duration" -v f="$FADE_DURATION" 'BEGIN { printf "%.9f", d - f }')"
frame_rate="$(printf '%s' "$render_format" | cut -d, -f3)"
total_frames="$(awk -v d="$total_duration" -v rate="$frame_rate" 'BEGIN { split(rate, p, "/"); printf "%d", d * p[1] / p[2] }')"

mkdir -p "$(dirname "$OUTPUT")"
filter="[0:v]settb=AVTB,setpts=PTS-STARTPTS,split=2[render][render_tail_source];[render_tail_source]trim=start=${render_tail_start}:end=${render_duration},setpts=PTS-STARTPTS[render_tail];[1:v]settb=AVTB,setpts=PTS-STARTPTS[mesh];[2:v]settb=AVTB,setpts=PTS-STARTPTS[simulation];[render][mesh]xfade=transition=fade:duration=${FADE_DURATION}:offset=${render_to_mesh}[render_mesh];[render_mesh][simulation]xfade=transition=fade:duration=${FADE_DURATION}:offset=${mesh_to_simulation}[render_mesh_simulation];[render_mesh_simulation][render_tail]xfade=transition=fade:duration=${FADE_DURATION}:offset=${simulation_to_render},format=yuv420p[out]"

ffmpeg -nostdin -y -v error \
  -i "$RENDER" -i "$MESH" -i "$SIMULATION" \
  -filter_complex "$filter" -map '[out]' -frames:v "$total_frames" -an \
  -c:v libx264 -crf "$CRF" -preset "$PRESET" -profile:v high \
  -pix_fmt yuv420p -movflags +faststart -map_metadata -1 "$OUTPUT"

ffmpeg -nostdin -y -v error -ss 0.75 -i "$OUTPUT" \
  -frames:v 1 -q:v 3 "$POSTER"

output_signature="$(video_signature "$OUTPUT")"
expected_signature="${render_format},${total_frames}"
if [ "$output_signature" != "$expected_signature" ]; then
  echo "Output validation failed." >&2
  echo "expected: $expected_signature" >&2
  echo "actual:   $output_signature" >&2
  exit 1
fi

echo "Wrote $OUTPUT"
echo "Wrote $POSTER"
echo "Crossfades at ${render_to_mesh}s, ${mesh_to_simulation}s, and ${simulation_to_render}s; loop duration ${total_duration}s"
