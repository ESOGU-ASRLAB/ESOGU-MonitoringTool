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

MM_TO_M = 0.001
FINITE = 1e6

t0 = time.time()
doc = FreeCAD.newDocument("conv")
Import.insert(src, doc.Name)
t_read = time.time() - t0

kept, dropped_small, dropped_named, dropped_crop, skipped = [], 0, 0, 0, 0
for o in doc.Objects:
    s = getattr(o, "Shape", None)
    if s is None or s.isNull() or len(s.Faces) == 0:
        continue
    bb = s.BoundBox
    if max(abs(bb.XMin), abs(bb.XMax), abs(bb.YMin), abs(bb.YMax)) > FINITE:
        skipped += 1          # datum plane / axis
        continue
    if crop_box:
        c = bb.Center
        if not (crop_box[0] <= c.x <= crop_box[1]
                and crop_box[2] <= c.y <= crop_box[3]
                and crop_box[4] <= c.z <= crop_box[5]):
            dropped_crop += 1
            continue
    if min_part and bb.DiagonalLength < min_part:
        dropped_small += 1
        continue
    if drop_rx and drop_rx.search(o.Label):
        dropped_named += 1
        continue
    kept.append(o)

t1 = time.time()
verts, idx, base = [], [], 0
for o in kept:
    try:
        pts, facets = o.Shape.tessellate(deflection)
    except Exception:
        continue
    if not pts or not facets:
        continue
    for p in pts:
        verts.extend((p.x * MM_TO_M, p.y * MM_TO_M, p.z * MM_TO_M))
    for f in facets:
        idx.extend((f[0] + base, f[1] + base, f[2] + base))
    base += len(pts)
t_tess = time.time() - t1

size = write_glb(dst, verts, idx)

bb_all = Part.Compound([o.Shape for o in kept]).BoundBox
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
