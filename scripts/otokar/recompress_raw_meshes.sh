#!/usr/bin/env bash
#
# Puts the meshes that never went through the optimiser through it.
#
# build_otokar_meshes.sh ends every job with weld -> simplify -> draco, and
# everything it produced is Draco-compressed and small. But three groups of
# meshes in client/public/meshes/otokar carry no compression at all and were
# clearly written by some other path:
#
#   bus/{hi,lo}/body.glb                       4 009 722 triangles, 68.6 MB
#   robot{1,2}/{hi,lo}/axis3_{fixed,middle,outer}.glb   (export_telescopic.py)
#   robot2/{hi,lo}/axis{4,5}.glb
#
# 18 files, 204 MB, against 1.5 MB for the largest properly-built part. The hi
# and lo copies of several of them are byte-identical, so the LOD tiers cost
# the same to fetch and draw -- LOD that is written but does not work.
#
# This applies the SAME steps with the SAME per-tier ratios the build script
# uses (tier_cfg), so the result is what those files should have been. It
# cannot re-tessellate -- that needs FreeCAD and the raw STEP -- so the lo tier
# is simplified from the hi mesh rather than re-meshed at a coarser chordal
# tolerance. That is a weaker lo than a rebuild would give, but it is a real
# one, and it is the difference between LOD working and not.
#
# Writes to a temp tree; it does not touch the served files. Compare, then copy.
#
#   bash scripts/otokar/recompress_raw_meshes.sh [outdir]
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SRC="$ROOT/client/public/meshes/otokar"
OUT="${1:-$ROOT/.tmp/recompress}"
GT="${GLTF_TRANSFORM:-npx --yes @gltf-transform/cli@4.5.0}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# group:relative path (without .glb). Tier is read from the path.
FILES="
bus:bus/hi/body
bus:bus/lo/body
robot:robot1/hi/axis3_fixed
robot:robot1/hi/axis3_middle
robot:robot1/hi/axis3_outer
robot:robot1/lo/axis3_fixed
robot:robot1/lo/axis3_middle
robot:robot1/lo/axis3_outer
robot:robot2/hi/axis3_fixed
robot:robot2/hi/axis3_middle
robot:robot2/hi/axis3_outer
robot:robot2/hi/axis4
robot:robot2/hi/axis5
robot:robot2/lo/axis3_fixed
robot:robot2/lo/axis3_middle
robot:robot2/lo/axis3_outer
robot:robot2/lo/axis4
robot:robot2/lo/axis5
"

# Straight from tier_cfg() in build_otokar_meshes.sh. Kept as a copy rather
# than sourced because that script runs FreeCAD jobs on load.
ratio_for() {
  case "$1:$2" in
    bus:hi)   echo "0.30 0.004" ;;
    bus:lo)   echo "0.10 0.015" ;;
    robot:hi) echo "0.40 0.002" ;;
    robot:lo) echo "0.12 0.012" ;;
  esac
}

mkdir -p "$OUT"
printf '%-34s %12s %12s %8s\n' file before after saved
total_before=0
total_after=0
failed=0

for entry in $FILES; do
  group="${entry%%:*}"
  rel="${entry#*:}"
  tier="$(basename "$(dirname "$rel")")"
  src="$SRC/$rel.glb"
  dst="$OUT/$rel.glb"
  if [ ! -s "$src" ]; then echo "SKIP missing: $rel"; continue; fi
  mkdir -p "$(dirname "$dst")"
  read -r ratio err <<<"$(ratio_for "$group" "$tier")"

  before=$(stat -c %s "$src")
  key="$(echo "$rel" | tr '/' '_')"
  if ! $GT weld "$src" "$TMP/$key.w.glb" >"$TMP/$key.log" 2>&1; then
    echo "FAIL weld: $rel"; tail -3 "$TMP/$key.log" >&2; failed=$((failed+1)); continue
  fi
  if ! $GT simplify "$TMP/$key.w.glb" "$TMP/$key.s.glb" --ratio "$ratio" --error "$err" >>"$TMP/$key.log" 2>&1; then
    echo "FAIL simplify: $rel"; tail -3 "$TMP/$key.log" >&2; failed=$((failed+1)); continue
  fi
  if ! $GT draco "$TMP/$key.s.glb" "$dst" >>"$TMP/$key.log" 2>&1; then
    echo "FAIL draco: $rel"; tail -3 "$TMP/$key.log" >&2; failed=$((failed+1)); continue
  fi
  rm -f "$TMP/$key.w.glb" "$TMP/$key.s.glb"

  after=$(stat -c %s "$dst")
  total_before=$((total_before+before))
  total_after=$((total_after+after))
  printf '%-34s %12s %12s %7sx\n' "$rel" "$before" "$after" \
    "$(awk "BEGIN{printf \"%.1f\", $before/$after}")"
done

echo
awk -v b="$total_before" -v a="$total_after" -v f="$failed" 'BEGIN{
  printf "TOTAL  %.1f MB -> %.1f MB  (%.1fx smaller, %.1f MB saved)\n",
    b/1048576, a/1048576, b/a, (b-a)/1048576;
  if (f) printf "%d file(s) FAILED -- nothing was copied over the served tree\n", f;
}'
echo "written to: $OUT"
