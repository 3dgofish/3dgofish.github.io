#!/bin/bash
# Generate responsive WebP delivery variants from the lossless PNG masters.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGES="$ROOT/static/images"

command -v cwebp >/dev/null || {
  echo "cwebp not found (brew install webp)" >&2
  exit 1
}

encode() {
  local name="$1"
  local width="$2"
  cwebp -quiet -mt -m 6 -q 88 -sharp_yuv -resize "$width" 0 \
    "$IMAGES/$name.png" -o "$IMAGES/$name-$width.webp"
  printf '%-36s %6s KB\n' "$name-$width.webp" "$(( $(stat -f%z "$IMAGES/$name-$width.webp") / 1024 ))"
}

for name in teaser pipeline main_results additional_qualitative high_complexity ood table1 table4; do
  encode "$name" 640
  encode "$name" 960
done

for name in teaser pipeline additional_qualitative high_complexity ood; do
  encode "$name" 1920
done

encode real_world 640

for input in "$ROOT"/static/models/*/input.png; do
  directory="$(dirname "$input")"
  cwebp -quiet -mt -m 6 -q 88 -sharp_yuv -resize 256 256 \
    "$input" -o "$directory/input-256.webp"
  cwebp -quiet -mt -m 6 -q 88 -sharp_yuv \
    "$input" -o "$directory/input-512.webp"
done

echo "Responsive images rebuilt."
