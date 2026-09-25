#!/usr/bin/env bash
# STEP -> decimated, Draco-compressed GLB for the Otokar MATISSE cell.
#
# Two LOD tiers are produced per part: "hi" for the close/default view and
# "lo" for the 16 m wide overview, where a rail carriage is a few pixels tall.
#
# Usage: build_otokar_meshes.sh [name ...]   (default: all robot parts)
set -euo pipefail

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

# The axis-2 cable chain. EKSEN2's ROOT is what gets written, so its children
# are skipped by the descendant guard and the root's Shape carries their
# geometry anyway -- a name drop cannot reach it. EXCLUDE_RE subtracts the
# solids instead (see convert.py).
#
# It is removed rather than repositioned because its exported pose is not a pose
# the machine has. The chain is drawn hanging straight down from the axis-2
# slide to cell Z -1866: that is 498 mm BELOW the factory floor at -1368, and
# 1154 mm below the slide it hangs from. The slide itself is only 700 mm tall
# (2_Eksen_Robot_Plakasi, Z -712..-12) -- everything under it is unfolded chain.
# Left in, it drags the column through the floor rail at every column height
# below 1200 mm, which is every height the underbody pass uses.
#
# Drawing it properly means folding it, and the CAD does not say how. The
# AXIS-1 chain is kept while this one is not, because that one lies in its tray
# in a pose the machine really does assume.
#
# The M5 sets go with it. They are the chain's own fixings -- its bracket bolts
# and the nuts and screws running its length -- and they are SIBLINGS of the
# chain under EKSEN2's root rather than children of it, so the name above does
# not reach them. They are identifiable as the chain's by sharing its Y band
# (-3519..-3151 against the chain's -3496..-3136), and they are what was left
# still reaching the floor at Z -1368 after the first pass: with the chain gone
# but its bolts still in, the column kept its 0 mm contact with the rail at a
# column height of 400 mm.
#
# There is NO static column structure inside EKSEN2 to separate out. Once the
# chain and its fixings are gone the lowest part left is
# 2_Eksen_Robot_Plakasi at Z -712, which is the moving slide; the column mast
# itself lives in EKSEN1's carriage as 2_Eksen_Sabit. So axis 2 needs no
# runway/carriage-style role split, unlike axis 1.
export EXCLUDE_RE='2_Eksen_Kablo_Traktoru|M5x40_Havsa_Basli|M5x20_Havsa_Basli|M5_Somun'

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
CROP_R2="-6000,6000,-99000,99000,-99000,99000"
# Robot2_EKSEN3's placed root is already at the carriage's native X station
# (~-12.4 m); including only |X|<6 m would discard that root and retain its
# unplaced children as detached fragments. The root is the only top-level
# solid, so this axis uses the full finite band and lets the descendant guard
# discard the master children.
CROP_R2_E3="-99000,99000,-99000,99000,-99000,99000"
CROP_CAM="-1000,1000,-1000,1000,-1000,1000"

# The per-axis exports do not share an origin. placements.json holds the
# native->installed matrix for each source file, with its provenance, and
# convert.py bakes it into the vertices so every GLB ships in one frame.
PLACEMENTS="$SCRIPTS/placements.json"

placement_field() {
  node -e '
    const fs = require("fs"), path = require("path");
    const all = JSON.parse(fs.readFileSync(path.resolve(process.argv[1]), "utf8"));
    const m = all.sources[process.argv[2]];
    if (!m) process.exit(0);
    const field = process.argv[3];
    if (field === "matrix") { if (m.matrix) console.log(m.matrix.join(",")); }
    else if (m[field]) console.log(String(m[field]).replace(/\s+/g, " "));
  ' "$PLACEMENTS" "$1" "$2"
}

convert_one() {
  local stem="$1" group="$2" out="$3" tier="$4" crop="$5"
  local role=""
  if [ "$out" = "axis1" ]; then role="runway"; fi
  if [ "$out" = "axis1_carriage" ]; then role="carriage"; fi
  if [ "$out" = "axis1_chain" ]; then role="chain"; fi
  if [ "$out" = "axis1_fixtures" ]; then role="fixtures"; fi
  # The axis-2 chain is lifted out of EKSEN2 by NAME rather than by role: that
  # file's root is what gets written, so a role test never reaches its children.
  local exclude="$EXCLUDE_RE" include_only=""
  if [ "$out" = "axis2_chain" ]; then exclude=""; include_only='2_Eksen_Kablo_Traktoru'; fi
  read -r defl minp ratio err <<<"$(tier_cfg "$tier" "$group")"
  local raw="$TMP/${stem}.${tier}.${out}.raw.glb"
  local dir="$DEST/$group/$tier"
  local placement placement_src
  placement="$(placement_field "$stem" matrix)"
  placement_src="$(placement_field "$stem" provenance)"
  mkdir -p "$dir"

  STP_IN="$SRC/${stem}.stp" GLB_OUT="$raw" DEFLECTION="$defl" MIN_PART_MM="$minp" \
    CROP="$crop" AXIS1_ROLE="$role" EXCLUDE_RE="$exclude" INCLUDE_ONLY_RE="$include_only" \
    REPORT_JSON="$TMP/${stem}.${tier}.${out}.json" \
    PLACEMENT="$placement" PLACEMENT_SRC="$placement_src" \
    "$FC" "$SCRIPTS/convert.py" 2>&1 | tee "$TMP/${stem}.${tier}.${out}.log" | grep "^STATS:" || {
    # Without the `|| ...` this pipeline's empty grep would trip `pipefail` and
    # kill the whole build mid-run, with no FAIL line and no further jobs -- the
    # failure that actually happened would never be printed. Show it instead.
    echo "FAIL convert: $stem $tier $out"
    tail -5 "$TMP/${stem}.${tier}.${out}.log" >&2
    return 1
  }

  if [ ! -s "$raw" ]; then echo "FAIL tessellate: $stem $tier"; return 1; fi

  $GT weld     "$raw"              "$TMP/${stem}.${tier}.${out}.w.glb" >/dev/null 2>&1 || return 1
  $GT simplify "$TMP/${stem}.${tier}.${out}.w.glb" "$TMP/${stem}.${tier}.${out}.s.glb" \
               --ratio "$ratio" --error "$err"  >/dev/null 2>&1 || return 1
  $GT draco    "$TMP/${stem}.${tier}.${out}.s.glb" "$dir/${out}.glb" >/dev/null 2>&1 || return 1

  rm -f "$raw" "$TMP/${stem}.${tier}.${out}.w.glb" "$TMP/${stem}.${tier}.${out}.s.glb"
  echo "OK  $group/$tier/${out}.glb  $(stat -c %s "$dir/${out}.glb") bytes"
}

# stem : group : output name : crop
#
# Robot 2 is its OWN machine on its OWN rail, mirrored across the bus, so it is
# built from Robot2_*.stp rather than by re-posing robot 1's meshes.
#
# Robot2_EKSEN2..5 have identity roots rather than a placed instance inside
# EKSEN1. Their matrices are therefore recorded explicitly in placements.json,
# derived from corresponding Robot1 envelopes and the end-view requirement that
# Robot2 is a mirror across the bus centre plane. They are baked here just like
# Robot1's chain; no runtime sibling/zero-offset workaround is allowed.
JOBS="
Robot1_EKSEN1:robot1:axis1:$CROP_R1
Robot1_EKSEN1:robot1:axis1_carriage:$CROP_R1
Robot1_EKSEN1:robot1:axis1_chain:$CROP_R1
Robot1_EKSEN1:robot1:axis1_fixtures:$CROP_R1
Robot1_EKSEN2:robot1:axis2:$CROP_R1
Robot1_EKSEN2:robot1:axis2_chain:$CROP_R1
Robot1_EKSEN3:robot1:axis3:$CROP_R1
Robot1_EKSEN4:robot1:axis4:$CROP_R1
Robot1_EKSEN5:robot1:axis5:$CROP_R1
Robot2_EKSEN1:robot2:axis1:$CROP_R2
Robot2_EKSEN1:robot2:axis1_carriage:$CROP_R2
Robot2_EKSEN1:robot2:axis1_chain:$CROP_R2
Robot2_EKSEN1:robot2:axis1_fixtures:$CROP_R2
Robot2_EKSEN2:robot2:axis2:$CROP_R2
Robot2_EKSEN2:robot2:axis2_chain:$CROP_R2
Robot2_EKSEN3:robot2:axis3:$CROP_R2_E3
Robot2_EKSEN4:robot2:axis4:$CROP_R2
Robot2_EKSEN5:robot2:axis5:$CROP_R2
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

# Ship the placement provenance beside the meshes: a baked frame is invisible
# in the GLB itself, so the record of what was baked and why travels with it.
node "$SCRIPTS/write_placements.mjs"
echo "=== BUILD DONE ==="
