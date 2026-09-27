#!/usr/bin/env bash
#
# The props, which are now the slow part of the page.
#
# recompress_raw_meshes.sh dealt with the Otokar cell: 204 MB of uncompressed
# CAD down to 3.7 MB. That left the scenery as the dominant cost, and measuring
# it shows the three assets need three DIFFERENT treatments -- which is why a
# single "run draco over everything" pass would have helped almost not at all:
#
#   walking_female.glb  20.45 MB   42 096 tris   32 images, 10.28 MB
#   warehouse.blend.glb  5.24 MB   51 444 tris   11 images,  4.44 MB
#   drone.glb            3.38 MB  119 090 tris    3 images,  0.04 MB
#
# The worker is 42 k triangles and 32 textures. Draco compresses geometry, and
# there is barely any geometry to compress -- the file is textures. Same for
# the warehouse shell. The drone is the opposite: almost no texture, six times
# the worker's triangles. So:
#
#   texture-bound assets -> resize to a sane maximum, then WebP
#   geometry-bound asset -> weld, then Draco
#
# Textures are capped at 1024 px. These are props seen from several metres
# away across a 30 m hall; at that distance a 2 k or 4 k map is delivering
# detail no pixel ever asks for.
#
# Writes to a temp tree and touches nothing that is served. Compare, then copy.
#
#   bash scripts/otokar/optimize_scene_assets.sh [outdir]
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SRC="$ROOT/client/public/assets"
OUT="${1:-$ROOT/.tmp/assets}"
GT="${GLTF_TRANSFORM:-npx --yes @gltf-transform/cli@4.5.0}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

MAX_TEXTURE=1024
WEBP_QUALITY=82

mkdir -p "$OUT"
printf '%-34s %12s %12s %8s\n' file before after saved
total_before=0
total_after=0
failed=0

run() {  # run <label> <logfile> <command...>
  local label="$1" log="$2"; shift 2
  if ! "$@" >>"$log" 2>&1; then
    echo "FAIL $label"; tail -4 "$log" >&2; return 1
  fi
}

# rel-path : treatment
JOBS="
worker/walking_female:texture
factory/warehouse_blender.blend:texture
drone/drone:geometry
bus/bus:geometry
"

for entry in $JOBS; do
  rel="${entry%%:*}"
  kind="${entry#*:}"
  src="$SRC/$rel.glb"
  dst="$OUT/$rel.glb"
  [ -s "$src" ] || { echo "SKIP missing: $rel"; continue; }
  mkdir -p "$(dirname "$dst")"
  key="$(echo "$rel" | tr '/' '_')"
  log="$TMP/$key.log"
  : >"$log"
  before=$(stat -c %s "$src")

  if [ "$kind" = texture ]; then
    run "resize $rel" "$log" $GT resize "$src" "$TMP/$key.r.glb" \
      --width "$MAX_TEXTURE" --height "$MAX_TEXTURE" || { failed=$((failed+1)); continue; }
    # WebP needs sharp, which ships with the CLI but can be absent on some
    # installs. Falling back to the resized-only file is much better than
    # failing the asset outright, so this one is allowed to miss.
    if $GT webp "$TMP/$key.r.glb" "$TMP/$key.t.glb" --quality "$WEBP_QUALITY" >>"$log" 2>&1; then
      :
    else
      echo "  note: webp unavailable for $rel, keeping resized PNG/JPEG"
      cp "$TMP/$key.r.glb" "$TMP/$key.t.glb"
    fi
    # Draco last, for whatever geometry there is. Skinned meshes keep their
    # joints and weights through it, so the worker's walk cycle survives.
    run "draco $rel" "$log" $GT draco "$TMP/$key.t.glb" "$dst" || { failed=$((failed+1)); continue; }
  else
    run "weld $rel" "$log" $GT weld "$src" "$TMP/$key.w.glb" || { failed=$((failed+1)); continue; }
    run "draco $rel" "$log" $GT draco "$TMP/$key.w.glb" "$dst" || { failed=$((failed+1)); continue; }
  fi

  after=$(stat -c %s "$dst")
  total_before=$((total_before+before))
  total_after=$((total_after+after))
  printf '%-34s %12s %12s %7sx\n' "$rel" "$before" "$after" \
    "$(awk "BEGIN{printf \"%.1f\", $before/$after}")"
done

echo
awk -v b="$total_before" -v a="$total_after" -v f="$failed" 'BEGIN{
  if (b == 0) { print "nothing processed"; exit }
  printf "TOTAL  %.2f MB -> %.2f MB  (%.1fx smaller, %.2f MB saved)\n",
    b/1048576, a/1048576, b/a, (b-a)/1048576;
  if (f) printf "%d asset(s) FAILED\n", f;
}'
echo "written to: $OUT"
