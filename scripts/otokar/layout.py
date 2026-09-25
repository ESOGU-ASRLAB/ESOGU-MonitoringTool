"""Where does the mass of each STEP assembly actually sit?

Bounding boxes alone were ambiguous (EKSEN1 reads ~16 m in BOTH X and Y), so
this bins part centroids along each CAD axis, weighted by part volume, to show
whether an assembly is one run of structure or two separated clusters.
"""
import os, json
import FreeCAD, Import

src = os.environ["STP_IN"]
doc = FreeCAD.newDocument("lay")
Import.insert(src, doc.Name)

FINITE = 1e6
parts = []
for o in doc.Objects:
    s = getattr(o, "Shape", None)
    if s is None or s.isNull() or len(s.Faces) == 0:
        continue
    bb = s.BoundBox
    if max(abs(bb.XMin), abs(bb.XMax), abs(bb.YMin), abs(bb.YMax)) > FINITE:
        continue
    if bb.DiagonalLength < 80:       # ignore fasteners
        continue
    c = bb.Center
    try:
        vol = abs(s.Volume)
    except Exception:
        vol = 0.0
    parts.append((o.Label, c.x, c.y, c.z, vol, bb.DiagonalLength))

print("PARTS_KEPT", len(parts))
tot = sum(p[4] for p in parts) or 1.0

for ai, an in ((1, "X"), (2, "Y"), (3, "Z")):
    vals = [p[ai] for p in parts]
    lo, hi = min(vals), max(vals)
    NB = 16
    w = (hi - lo) / NB if hi > lo else 1.0
    bins = [0.0] * NB
    for p in parts:
        b = min(NB - 1, int((p[ai] - lo) / w))
        bins[b] += p[4]
    bar = "".join("#" if v / tot > 0.08 else ("+" if v / tot > 0.02 else ("." if v > 0 else " ")) for v in bins)
    print("%s centroid span %9.1f .. %9.1f  |%s|" % (an, lo, hi, bar))

# the ten biggest parts by volume, with their extents -- these are the
# structural members that define the machine's layout
parts.sort(key=lambda p: -p[4])
print("TOP PARTS (label, centroid XYZ mm, bbox diag mm):")
for p in parts[:10]:
    print("   %-46s  (%9.1f %9.1f %9.1f)  diag=%8.1f" % (p[0][:46], p[1], p[2], p[3], p[5]))
