"""STEP -> GLB for the Otokar MATISSE cell.

Run under freecadcmd. Config comes from env vars, NOT argv: freecadcmd tries to
*open* every argv entry that isn't the script, which collides with document
names and silently misroutes Import.insert.

  STP_IN        source .stp
  GLB_OUT       destination .glb
  DEFLECTION    linear tessellation deflection, mm (chordal error)
  MIN_PART_MM   drop any part whose bbox diagonal is below this (mm).
                This is the LOD knob: fasteners, pins and chain links are all
                small, so a size cut removes thousands of dense little solids
                while leaving every structural part's silhouette intact.
  DROP_NAME_RE  regex of part labels to drop outright (fasteners etc). Some
                fasteners are long enough to survive the size cut -- the
                M16x380 floor studs are 380 mm -- so name and size are both
                needed.
  CROP          optional "xmin,xmax,ymin,ymax,zmin,zmax" in mm; a part is kept
                only if its bbox CENTRE falls inside. Every one of these files
                contains the assembly twice -- once laid out along CAD X and a
                mirrored copy laid out along CAD Y -- and only one of the two is
                the machine as installed. The crop picks that one.
  REPORT_JSON   optional path for conversion stats
  AXIS1_ROLE    for EKSEN1 only: "runway" (fixed track) or "carriage"
                (the 1_Eksen_Hareketli moving subassembly).
  PLACEMENT     optional 16 comma-separated floats, a row-major 4x4 matrix in
                MILLIMETRES, baked into the vertices so the GLB ships in the
                cell's installed frame instead of its own file's frame.

                The per-axis STEP exports do NOT share an origin: EKSEN2..5 are
                written in the axis-2 column's own master frame, and the
                transform onto EKSEN1's installed frame is that column's
                assembly placement (a 180 deg rotation about Z plus a
                translation). Baking it here is deliberate: the previous design
                carried it as render-time offset constants, where a pure
                translation silently stood in for a rotation -- leaving the arm
                and camera pointing away from the body -- and bbox adjacency
                checks could not detect it. Provenance for every matrix is
                recorded in client/public/meshes/otokar/placements.json.
  PLACEMENT_SRC free text describing where PLACEMENT came from; echoed into the
                stats so a baked mesh can always be traced back to its source.
"""
import os, sys, json, time, re
from collections import Counter
import FreeCAD, Import, Part

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from glbwrite import write_glb

src = os.environ["STP_IN"]
dst = os.environ["GLB_OUT"]
deflection = float(os.environ.get("DEFLECTION", "4"))
min_part = float(os.environ.get("MIN_PART_MM", "0"))
crop = os.environ.get("CROP")
crop_box = [float(v) for v in crop.split(",")] if crop else None
drop_re = os.environ.get("DROP_NAME_RE")
drop_rx = re.compile(drop_re, re.I) if drop_re else None
report = os.environ.get("REPORT_JSON")
axis1_role = os.environ.get("AXIS1_ROLE", "")
if axis1_role not in ("", "runway", "carriage"):
    raise ValueError("AXIS1_ROLE must be runway or carriage")

placement_raw = os.environ.get("PLACEMENT", "").strip()
placement_src = os.environ.get("PLACEMENT_SRC", "")
placement = None
if placement_raw:
    values = [float(v) for v in placement_raw.split(",")]
    if len(values) != 16:
        raise ValueError("PLACEMENT needs 16 comma-separated values, got %d" % len(values))
    placement = FreeCAD.Matrix(*values)

MM_TO_M = 0.001
FINITE = 1e6

t0 = time.time()
doc = FreeCAD.newDocument("conv")
Import.insert(src, doc.Name)
t_read = time.time() - t0

kept, dropped_small, dropped_named, dropped_crop, skipped, skipped_non_solid = [], 0, 0, 0, 0, 0
descendants_skipped, dropped_role = 0, 0
eligible = {}
solid_shapes = {}

def ancestors(obj):
    stack = list(obj.InList)
    seen = set()
    while stack:
        parent = stack.pop()
        if parent.Name in seen:
            continue
        seen.add(parent.Name)
        yield parent
        stack.extend(parent.InList)

# Matched on Label, not internal Name: FreeCAD 1.1's STEP import names objects
# generically (LinkGroup020, Solid057) and only Label carries the CAD product
# name, so the previous Name-based test matched nothing and filed every part
# into the runway.
#
# 2_Eksen_Sabit_SYM is the axis-2 column. "Sabit" marks it as the STATOR of
# axis 2, not as fixed to the floor -- its base plate is bolted to the saddle,
# so it travels with a1, and everything from the axis-2 slide upward hangs off
# it. It is a SIBLING of the saddle in the assembly tree, so an ancestor-only
# test mis-files it as static runway.
CARRIAGE_BRANCHES = {"1_Eksen_Hareketli_SYM", "2_Eksen_Sabit_SYM"}
EKSEN1_ROOT = "1_Eksen_SYM"

def role_of(obj):
    labels = {obj.Label} | {parent.Label for parent in ancestors(obj)}
    return "carriage" if labels & CARRIAGE_BRANCHES else "runway"

for o in doc.Objects:
    # EKSEN1 needs two outputs. Its overall root contains both the static
    # runway and moving carriage, so select its placed first-level branches.
    if axis1_role and o.Label == EKSEN1_ROOT:
        eligible[o.Name] = False
        continue
    s = getattr(o, "Shape", None)
    if s is None or s.isNull() or len(s.Faces) == 0:
        eligible[o.Name] = False
        continue
    # STEP imports may also expose PMI/dimension or construction geometry as
    # Shape objects. Only tessellate actual solids; annotations must never
    # become visible GLB geometry. The current exports contain DIMENSION
    # records but no annotation solids, so this is both a guard and a future
    # regression check.
    if not getattr(s, "Solids", None):
        skipped_non_solid += 1
        eligible[o.Name] = False
        continue
    bb = s.BoundBox
    if max(abs(bb.XMin), abs(bb.XMax), abs(bb.YMin), abs(bb.YMax), abs(bb.ZMin), abs(bb.ZMax)) > FINITE:
        # Some assembly groups carry an infinite datum plane in Shape, even
        # though their solid bodies are correctly placed and finite. Strip
        # those non-solid faces before deciding whether to keep the group.
        solid_shapes[o.Name] = Part.Compound(s.Solids)
        bb = solid_shapes[o.Name].BoundBox
        if max(abs(bb.XMin), abs(bb.XMax), abs(bb.YMin), abs(bb.YMax), abs(bb.ZMin), abs(bb.ZMax)) > FINITE:
            skipped += 1
            eligible[o.Name] = False
            continue
    if crop_box:
        c = bb.Center
        if not (crop_box[0] <= c.x <= crop_box[1]
                and crop_box[2] <= c.y <= crop_box[3]
                and crop_box[4] <= c.z <= crop_box[5]):
            dropped_crop += 1
            eligible[o.Name] = False
            continue
    if min_part and bb.DiagonalLength < min_part:
        dropped_small += 1
        eligible[o.Name] = False
        continue
    if drop_rx and drop_rx.search(o.Label):
        dropped_named += 1
        eligible[o.Name] = False
        continue
    eligible[o.Name] = True

for o in doc.Objects:
    if not eligible.get(o.Name):
        continue
    if any(eligible.get(parent.Name) for parent in ancestors(o)):
        # Imported STEP subassembly Shapes are already placed in the assembly
        # frame. Their child Shapes can still have local coordinates; writing
        # both produces double geometry and detached "ghost" machine parts.
        descendants_skipped += 1
        continue
    if axis1_role and role_of(o) != axis1_role:
        dropped_role += 1
        continue
    kept.append(o)

if not kept:
    raise RuntimeError("No solid assembly parts survived conversion filters")

t1 = time.time()
verts, idx, base = [], [], 0
for o in kept:
    try:
        solid_shape = solid_shapes.get(o.Name)
        if solid_shape is None:
            solid_shape = Part.Compound(o.Shape.Solids)
        pts, facets = solid_shape.tessellate(deflection)
    except Exception:
        continue
    if not pts or not facets:
        continue
    for p in pts:
        q = placement.multiply(p) if placement else p
        verts.extend((q.x * MM_TO_M, q.y * MM_TO_M, q.z * MM_TO_M))
    for f in facets:
        idx.extend((f[0] + base, f[1] + base, f[2] + base))
    base += len(pts)
t_tess = time.time() - t1

size = write_glb(dst, verts, idx)

# Report the bbox of what was actually WRITTEN, so a baked placement shows up
# in the stats rather than the pre-transform source bounds.
if verts:
    xs = verts[0::3]
    ys = verts[1::3]
    zs = verts[2::3]
    bb_all = FreeCAD.BoundBox(min(xs) / MM_TO_M, min(ys) / MM_TO_M, min(zs) / MM_TO_M,
                              max(xs) / MM_TO_M, max(ys) / MM_TO_M, max(zs) / MM_TO_M)
else:
    bb_all = Part.Compound(
        [solid_shapes.get(o.Name) or Part.Compound(o.Shape.Solids) for o in kept]).BoundBox
stats = {
    "src": os.path.basename(src),
    "dst": os.path.basename(dst),
    "deflection_mm": deflection,
    "min_part_mm": min_part,
    "parts_kept": len(kept),
    "parts_dropped_small": dropped_small,
    "parts_dropped_named": dropped_named,
    "parts_dropped_crop": dropped_crop,
    "crop": crop_box,
    "datums_skipped": skipped,
    "non_solids_skipped": skipped_non_solid,
    "descendants_skipped": descendants_skipped,
    "parts_dropped_role": dropped_role,
    "axis1_role": axis1_role,
    "placement": placement_raw or None,
    "placement_src": placement_src or None,
    "vertices": len(verts) // 3,
    "triangles": len(idx) // 3,
    "glb_bytes": size,
    "read_sec": round(t_read, 1),
    "tessellate_sec": round(t_tess, 1),
    "bbox_min_mm": [round(bb_all.XMin, 3), round(bb_all.YMin, 3), round(bb_all.ZMin, 3)],
    "bbox_max_mm": [round(bb_all.XMax, 3), round(bb_all.YMax, 3), round(bb_all.ZMax, 3)],
}
print("STATS:" + json.dumps(stats))
if report:
    with open(report, "w") as f:
        json.dump(stats, f, indent=2)
