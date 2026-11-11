#!/usr/bin/env bash
# words-clip.sh — make a looping clip of handwritten words and crosses on black, to lay over a camera layer (blend Add).
#
#   scripts/show/words-clip.sh --font FONT.ttf --out OUT.mp4 [--size 1920x1080] [--secs 8] [--fps 30]
#                              [--colour '#ff1a1a'] [--offset COLOUR] [--offset-px N] [--jitter 9] [--dry-run] WORDS.txt
#
# WORDS.txt: one mark per line, fields separated by "|":
#     text | x % | y % | point size | rotation in degrees | from second | to second
#     text | x % | y % | point size | rotation in degrees | from second | to second [| font file [| colour [| offset colour]]]
#   The optional 8th field names another font file for that one mark (absolute, or beside the words file), so one clip can
#   mix scripts, e.g. a Latin marker font and an Armenian one. ImageMagick does not fall back to another font by itself.
#   The optional 9th field is that mark's own colour and the 10th its own offset colour ("-" = no offset for this mark).
#   An empty field keeps the clip's setting.
#   x and y place the top-left corner of the mark, in percent of the picture. Lines starting with # are skipped.
# --offset COLOUR draws every mark a second time in that colour under the mark, shifted down and to the right: the thin
#   pale line of a printed poster. --offset-px N is the shift in pixels (default: 2.5 % of the mark's point size, at least 2).
# Each mark is drawn once with ImageMagick in the font file you name (keep that font's licence next to it). ffmpeg then
# lays the marks on black for their time window and moves each one a few pixels 12 times a second, like a hand-drawn loop.
# Nothing is installed or changed. Output: OUT.mp4 and OUT.mp4.txt (the font's sha256, the settings and the marks).
# Undo: delete the two files. --dry-run prints the marks and the ffmpeg filter and writes nothing.
set -euo pipefail

TMP_DIR=""
cleanup() { if [[ -n ${TMP_DIR:-} && -d ${TMP_DIR:-} ]]; then rm -rf -- "$TMP_DIR"; fi; }
trim() { local s=$1; s="${s#"${s%%[![:space:]]*}"}"; s="${s%"${s##*[![:space:]]}"}"; printf '%s' "$s"; }

main() {
    local font="" out="" size=1920x1080 secs=8 fps=30 colour='#ff1a1a' offset="" offset_px=0 jitter=9 dry=0 words=""
    while (( $# )); do
        case "$1" in
            --font) font=$2; shift 2 ;;
            --out) out=$2; shift 2 ;;
            --size) size=$2; shift 2 ;;
            --secs) secs=$2; shift 2 ;;
            --fps) fps=$2; shift 2 ;;
            --colour) colour=$2; shift 2 ;;
            --offset) offset=$2; shift 2 ;;
            --offset-px) offset_px=$2; shift 2 ;;
            --jitter) jitter=$2; shift 2 ;;
            --dry-run) dry=1; shift ;;
            -h|--help) sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; return 0 ;;
            -*) echo "unknown option: $1 (see --help)" >&2; return 2 ;;
            *) words=$1; shift ;;
        esac
    done
    if [[ ! -f $font || ! -f $words || -z $out ]]; then
        echo "need --font FILE, --out FILE and a words file (see --help)" >&2; return 2
    fi
    if ! command -v magick >/dev/null || ! command -v ffmpeg >/dev/null; then
        echo "this needs ImageMagick (magick) and ffmpeg" >&2; return 1
    fi
    local w=${size%x*} h=${size#*x}
    TMP_DIR=$(mktemp -d); trap cleanup EXIT

    local inputs=(-f lavfi -i "color=c=black:s=${w}x${h}:r=${fps}:d=${secs}")
    local graph="[0:v]format=rgba[bg];" last=bg n=0 marks=""
    local text x y pt rot from to mfont mcol moff px py png f fsum col off opx
    local -A fonts=()
    while IFS='|' read -r text x y pt rot from to mfont mcol moff || [[ -n ${text:-} ]]; do
        text=$(trim "${text:-}")
        if [[ -z $text || $text == \#* ]]; then continue; fi
        x=$(trim "$x"); y=$(trim "$y"); pt=$(trim "$pt"); rot=$(trim "$rot"); from=$(trim "$from"); to=$(trim "$to")
        mfont=$(trim "${mfont:-}"); f=$font
        if [[ -n $mfont ]]; then
            f=$mfont; [[ $f == /* ]] || f="$(dirname -- "$words")/$f"
            if [[ ! -f $f ]]; then echo "font not found for mark '$text': $f" >&2; return 2; fi
        fi
        fonts[$f]=1
        # This mark's colour and offset colour: its own field when given, else the clip's; "-" turns the offset off.
        mcol=$(trim "${mcol:-}"); moff=$(trim "${moff:-}")
        col=${mcol:-$colour}; off=${moff:-$offset}
        if [[ $off == - ]]; then off=""; fi
        opx=0
        if [[ -n $off ]]; then
            opx=$offset_px
            if (( opx <= 0 )); then opx=$(awk -v p="$pt" 'BEGIN { v = int(p * 0.025 + 0.5); if (v < 2) v = 2; printf "%d", v }'); fi
        fi
        px=$(awk -v a="$w" -v b="$x" 'BEGIN { printf "%d", a * b / 100 }')
        py=$(awk -v a="$h" -v b="$y" 'BEGIN { printf "%d", a * b / 100 }')
        png="$TMP_DIR/mark-$n.png"
        marks+="  $text | at $px,$py px | size $pt | turned $rot | $from to $to s | font $(basename -- "$f") | colour $col"
        if [[ -n $off ]]; then marks+=" | offset $off $opx px"; fi
        marks+=$'\n'
        if (( ! dry )); then
            if [[ -n $off ]]; then
                # The offset copy first (shifted down and right), the mark on top, merged to one picture, then turned.
                magick -background none \
                    \( -fill "$off" -font "$f" -pointsize "$pt" label:"$text" -repage "+$opx+$opx" \) \
                    \( -fill "$col" -font "$f" -pointsize "$pt" label:"$text" -repage +0+0 \) \
                    -layers merge +repage -rotate "$rot" +repage "PNG32:$png"
            else
                magick -background none -fill "$col" -font "$f" -pointsize "$pt" label:"$text" -rotate "$rot" +repage "PNG32:$png"
            fi
        fi
        inputs+=(-loop 1 -framerate "$fps" -t "$secs" -i "$png")
        graph+="[$last][$((n + 1)):v]overlay=x='$px+$jitter*sin(floor(t*12)*12.9898+$n*78.233)':y='$py+$jitter*cos(floor(t*12)*4.1414+$n*37.719)':enable='between(t,$from,$to)'[v$n];"
        last="v$n"; n=$((n + 1))
    done < "$words"
    if (( n == 0 )); then echo "no marks in $words" >&2; return 2; fi
    graph+="[$last]format=yuv420p[out]"

    if (( dry )); then
        echo "dry run, nothing is written. $n marks, ${w}x${h}, $secs s, $fps fps, colour $colour${offset:+, offset $offset}:"
        printf '%s' "$marks"
        echo "ffmpeg filter: $graph"
        return 0
    fi
    ffmpeg -hide_banner -loglevel error -y "${inputs[@]}" -filter_complex "$graph" -map "[out]" \
        -t "$secs" -r "$fps" -c:v libx264 -crf 16 -preset medium -pix_fmt yuv420p -movflags +faststart -an "$out"
    {
        echo "made by scripts/show/words-clip.sh on $(date '+%F %H:%M')"
        echo "font: $font  sha256 $(sha256sum "$font" | cut -d' ' -f1)"
        for f in "${!fonts[@]}"; do
            if [[ $f != "$font" ]]; then echo "font (per mark): $f  sha256 $(sha256sum "$f" | cut -d' ' -f1)"; fi
        done
        echo "size ${w}x${h}, $secs s, $fps fps, colour $colour${offset:+, offset $offset}, jitter $jitter px; words file: $words"
        printf '%s' "$marks"
    } > "$out.txt"
    echo "wrote $out ($n marks) and $out.txt"
}

if [[ ${BASH_SOURCE[0]} == "$0" ]]; then main "$@"; fi
