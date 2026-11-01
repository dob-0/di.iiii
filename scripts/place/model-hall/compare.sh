#!/usr/bin/env bash
# compare.sh <plan.json> <images_dir> <renders_dir> - each eye-level render beside its source frame,
# and one sheet of all of them (compare_all.png). Needs ImageMagick 7 (magick) and python3.
set -euo pipefail
plan=$1; imgs=$2; rd=$3
python3 -c "import json,sys;[print(v['name'],v['frame']) for v in json.load(open(sys.argv[1]))['views']]" "$plan" |
while read -r name frame; do
  magick "$imgs/$frame" -resize 540x960 "$rd/$name.png" +append "$rd/compare_$name.png"
done
magick "$rd"/compare_eye*.png -append -resize 50% "$rd/compare_all.png"
echo "$rd/compare_all.png"
