"""Bounding box of parts whose label matches PART_RE, in one STEP file.

Used to read a datum face off the CAD instead of estimating it -- e.g. the top
mounting face of the rail's floor feet, which is what the bus body's measured
1646.2384 mm ride height is referenced from.

  STP_IN    source .stp
  PART_RE   case-insensitive regex matched against part labels
"""
import os, re
import FreeCAD, Import, Part

rx = re.compile(os.environ.get("PART_RE", "."), re.I)
z_below = os.environ.get("Z_BELOW")   # optional: only parts reaching below this Z (mm)
doc = FreeCAD.newDocument("q")
Import.insert(os.environ["STP_IN"], doc.Name)

hits = []
for o in doc.Objects:
    s = getattr(o, "Shape", None)
    if s is None or s.isNull() or len(s.Faces) == 0 or not rx.search(o.Label):
        continue
    bb = s.BoundBox
    if max(abs(bb.XMin), abs(bb.XMax)) > 1e6:
        continue
    if z_below is not None and bb.ZMin > float(z_below):
        continue
    hits.append(o)

print("matches:", len(hits))
if 0 < len(hits) <= 16:
    for o in sorted(hits, key=lambda h: h.Shape.BoundBox.Center.y):
        b = o.Shape.BoundBox
        print("   %-38s Y %8.1f .. %8.1f   X %9.1f .. %8.1f   Z %8.1f .. %8.1f"
              % (o.Label[:38], b.YMin, b.YMax, b.XMin, b.XMax, b.ZMin, b.ZMax))
if hits:
    bb = Part.Compound([o.Shape for o in hits]).BoundBox
    print("labels  :", sorted({o.Label for o in hits})[:6])
    print("bbox_min: %.1f %.1f %.1f" % (bb.XMin, bb.YMin, bb.ZMin))
    print("bbox_max: %.1f %.1f %.1f" % (bb.XMax, bb.YMax, bb.ZMax))
