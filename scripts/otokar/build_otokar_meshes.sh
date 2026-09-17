#!/usr/bin/env bash
# STEP -> decimated, Draco-compressed GLB for the Otokar MATISSE cell.
#
# Two LOD tiers are produced per part: "hi" for the close/default view and
# "lo" for the 16 m wide overview, where a rail carriage is a few pixels tall.
#
# Usage: build_otokar_meshes.sh [name ...]   (default: all robot parts)
set -u

SCRIPTS="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$SCRIPTS/../.." && pwd)"
SRC="${OTOKAR_RAW_CAD:-$REPO/raw-cad/otokar}"
DEST="$REPO/client/public/meshes/otokar"
TMP="${TMPDIR:-/tmp}/otokar-mesh-build"

# Override either of these if the tools live elsewhere.
FC="${FREECADCMD:-/c/Program Files/FreeCAD 1.1/bin/freecadcmd.exe}"
GT="${GLTF_TRANSFORM:-npx --yes @gltf-transform/cli@4.5.0}"

if [ ! -x "$FC" ] && ! command -v "$FC" >/dev/null 2>&1; then
  echo "freecadcmd not found at: $FC" >&2
  echo "Install FreeCAD 1.1+ or set FREECADCMD to its freecadcmd binary." >&2
  exit 1
fi
if [ ! -d "$SRC" ]; then
  echo "raw CAD directory not found: $SRC" >&2
  echo "Populate it with Otokar's .stp files, or set OTOKAR_RAW_CAD." >&2
  exit 1
fi

# Fasteners: thousands of dense little solids (bolts, nuts, pins, springs)
# that contribute nothing to the silhouette at this scale. Dropped at both LOD
# tiers.
#
# "kettenglied" (chain LINK) used to be in this list; removed after checking
# it against the geometry. It is not a fastener, but it also turned out not to
# be axis 1's real cable carrier either: every "_Kettenglied" instance in
# Robot1_EKSEN1.stp sits at Y 6556-14878mm, entirely outside the +/-6000mm crop
# band that keeps the installed copy (see docs/otokar-cad-notes.md), so this
# change is a naming-hygiene fix with no visible effect on the current models,
# not a fix for a missing chain. The real, installed cable carrier is a
# different, unfiltered part (Kablo_Traktoru / Kablo_Tavasi_Komple, ~16 m
# long) that was already being kept -- see the completeness note in
# docs/otokar-cad-notes.md.
export DROP_NAME_RE='civata|somun|saplama|pim_|_pim|imbus|alyan|rondela|washer|screw|bolt|feder|dowel'

mkdir -p "$TMP" "$DEST"

# tier: deflection  min_part_mm  simplify_ratio  simplify_error
#
# The bus body gets its own, coarser numbers. It is a 12.5 m sheet-metal
# assembly of 2 439 parts, and the robot settings applied to it produce a
# multi-hundred-MB intermediate for detail that is sub-pixel on a vehicle this
# size. Its panels are large and flat, so a bigger chordal tolerance costs it
# far less than it would the machined robot parts.
tier_cfg() {
  local tier="$1" group="${2:-}"
  if [ "$group" = "bus" ]; then
    case "$tier" in
      hi) echo "15 60 0.30 0.004" ;;
      lo) echo "40 150 0.10 0.015" ;;
    esac
    return
  fi
  case "$tier" in
    hi) echo "6 25 0.40 0.002" ;;
    lo) echo "20 80 0.12 0.012" ;;
  esac
}

# Every one of these exports contains the assembly TWICE: the machine as
# installed, plus a mirrored copy of it laid out along the other horizontal
# axis (the "_SYM" instances). Cropping on part centroid keeps the installed
# one. Robot1's machine runs along CAD X (rail at Y ~= +3160 mm), Robot2's runs
# along CAD Y (rail at X ~= +135 mm), so they need opposite crops. Verified by
# rendering each part set -- see docs/otokar-cad-notes.md.
CROP_R1="-99000,99000,-6000,6000,-99000,99000"
# The camera head is exported in its own local frame, centred on the origin,
# in Robot2_Kamera.stp. Robot1_Kamera.stp holds the same hardware but placed
# 3.9 m off in X with no relation to its own axis-5 flange, so both robots
# share the origin-centred one and get mounted by transform instead.
CROP_CAM="-1000,1000,-1000,1000,-1000,1000"

convert_one() {
  local stem="$1" group="$2" out="$3" tier="$4" crop="$5"
  read -r defl minp ratio err <<<"$(tier_cfg "$tier" "$group")"
  local raw="$TMP/${stem}.${tier}.raw.glb"
  local dir="$DEST/$group/$tier"
  mkdir -p "$dir"

  STP_IN="$SRC/${stem}.stp" GLB_OUT="$raw" DEFLECTION="$defl" MIN_PART_MM="$minp" \
    CROP="$crop" REPORT_JSON="$TMP/${stem}.${tier}.${group}.json" \
    "$FC" "$SCRIPTS/convert.py" 2>&1 | grep "^STATS:"

  if [ ! -s "$raw" ]; then echo "FAIL tessellate: $stem $tier"; return 1; fi

  $GT weld     "$raw"              "$TMP/${stem}.${tier}.w.glb" >/dev/null 2>&1 || return 1
  $GT simplify "$TMP/${stem}.${tier}.w.glb" "$TMP/${stem}.${tier}.s.glb" \
               --ratio "$ratio" --error "$err"  >/dev/null 2>&1 || return 1
  $GT draco    "$TMP/${stem}.${tier}.s.glb" "$dir/${out}.glb" >/dev/null 2>&1 || return 1

  rm -f "$raw" "$TMP/${stem}.${tier}.w.glb" "$TMP/${stem}.${tier}.s.glb"
  echo "OK  $group/$tier/${out}.glb  $(stat -c %s "$dir/${out}.glb") bytes"
}

# stem : group : output name : crop
#
# Robot2_EKSEN1..5 are deliberately absent. The two robots are the same machine
# (identical face counts) and physically two carriages on one runway, so the
# scene draws both from the robot1 set and varies only their axis-1 value.
#
# Robot 2's exports are also the ones the mirrored-duplicate crop cannot
# resolve: its EKSEN2 still comes out 0.82 x 15.76 x 6.51 m against Robot 1's
# 2.41 x 3.66 x 2.05 m for the same part, because for Robot 2 the duplicate
# lies along the same axis its real machine runs on. Converting them would ship
# ~6 MB of geometry that lands outside the building. Only Robot2_Kamera is
# used, and only because it is the one file with the camera head in a usable
# local frame.
JOBS="
Robot1_EKSEN1:robot1:axis1:$CROP_R1
Robot1_EKSEN2:robot1:axis2:$CROP_R1
Robot1_EKSEN3:robot1:axis3:$CROP_R1
Robot1_EKSEN4:robot1:axis4:$CROP_R1
Robot1_EKSEN5:robot1:axis5:$CROP_R1
Robot2_Kamera:shared:camera:$CROP_CAM
16N37D-1__01092026:bus:body:
"

for job in $JOBS; do
  stem="${job%%:*}"; rest="${job#*:}"; group="${rest%%:*}"
  rest2="${rest#*:}"; out="${rest2%%:*}"; crop="${rest2#*:}"
  [ "$crop" = "$out" ] && crop=""
  if [ "$#" -gt 0 ]; then
    case " $* " in *" $stem "*) ;; *) continue ;; esac
  fi
  for tier in hi lo; do
    echo "--- $stem [$tier] ---"
    convert_one "$stem" "$group" "$out" "$tier" "$crop"
  done
done
echo "=== BUILD DONE ==="
