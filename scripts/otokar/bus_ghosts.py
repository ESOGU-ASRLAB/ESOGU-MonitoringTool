"""Name the bus-body solids that sit OUTSIDE the vehicle, and say why.

bus_islands.mjs finds the strays geometrically, in the finished GLB, where
nothing carries a part name. This works on the STEP itself.

It matters that convert.py writes the bus as ONE object: the whole assembly root
is eligible, so every other object is skipped by the descendant guard and the
GLB is a single tessellated compound of the root's Shape. A stray in that GLB is
therefore a solid that the placed assembly really contains at that position --
not a separately-written unplaced master copy, which is the failure mode the
descendant guard exists for and which the per-axis robot files DO show.

So the report is per SOLID of the root compound, not per object:

  * every solid whose bbox falls outside the body envelope, and
  * for each, whether another solid of the same volume exists elsewhere
    (a same-volume solid inside the body means the stray is a duplicate that
    should be dropped; no match means it is the only copy of that part and
    moving it, not deleting it, is the fix), and
  * the named object whose own Shape bbox matches it, which is its part number.

  STP_IN=raw-cad/otokar/16N37D-1__01092026.stp \
  "/c/Program Files/FreeCAD 1.1/bin/freecadcmd.exe" scripts/otokar/bus_ghosts.py
"""
import os
import FreeCAD, Import, Part

src = os.environ["STP_IN"]
FINITE = 1e6

# The 0.5/99.5 percentile envelope of the converted mesh -- the body itself,
# measured by bus_islands.mjs.
ENV = ((-9552.9, 2302.2), (-1252.3, 1251.7), (175.7, 2887.1))

doc = FreeCAD.newDocument("ghosts")
Import.insert(src, doc.Name)
print("imported objects: %d" % len(doc.Objects), flush=True)

roots = [o for o in doc.Objects if not o.InList and getattr(o, "Shape", None) is not None]
print("roots: %s" % ", ".join("%s (%s)" % (o.Label, o.Name) for o in roots), flush=True)

root = roots[0]
solids = root.Shape.Solids
print("solids in root compound: %d" % len(solids), flush=True)


def outside(bb):
    lo = (bb.XMin, bb.YMin, bb.ZMin)
    hi = (bb.XMax, bb.YMax, bb.ZMax)
    return [("XYZ"[d], lo[d], hi[d]) for d in range(3)
            if hi[d] < ENV[d][0] or lo[d] > ENV[d][1]]


records = []
for i, s in enumerate(solids):
    bb = s.BoundBox
    if max(abs(bb.XMin), abs(bb.XMax), abs(bb.YMin), abs(bb.YMax), abs(bb.ZMin), abs(bb.ZMax)) > FINITE:
        continue
    records.append((i, bb, s.Volume))

strays = [(i, bb, v) for i, bb, v in records if outside(bb)]
print("\nSOLIDS OUTSIDE THE BODY ENVELOPE: %d\n" % len(strays), flush=True)

# Named objects, so a stray solid can be given its part number.
named = []
for o in doc.Objects:
    sh = getattr(o, "Shape", None)
    if sh is None or sh.isNull() or not getattr(sh, "Solids", None):
        continue
    bb = sh.BoundBox
    if max(abs(bb.XMin), abs(bb.XMax), abs(bb.YMin), abs(bb.YMax), abs(bb.ZMin), abs(bb.ZMax)) > FINITE:
        continue
    named.append((o, bb))


def near(a, b, tol=2.0):
    return (abs(a.XMin - b.XMin) < tol and abs(a.XMax - b.XMax) < tol
            and abs(a.YMin - b.YMin) < tol and abs(a.YMax - b.YMax) < tol
            and abs(a.ZMin - b.ZMin) < tol and abs(a.ZMax - b.ZMax) < tol)


for i, bb, vol in sorted(strays, key=lambda r: -r[1].DiagonalLength):
    print("solid #%d  volume %.0f mm3" % (i, vol))
    print("   bbox X[%.0f, %.0f]  Y[%.0f, %.0f]  Z[%.0f, %.0f]   size %.0f x %.0f x %.0f"
          % (bb.XMin, bb.XMax, bb.YMin, bb.YMax, bb.ZMin, bb.ZMax,
             bb.XLength, bb.YLength, bb.ZLength))
    print("   clears envelope on: %s" % ", ".join(a for a, _, _ in outside(bb)))
    hits = [o.Label for o, ob in named if near(ob, bb)]
    print("   named objects at this exact bbox: %s" % (", ".join(hits) if hits else "NONE"))
    same = [(j, ob) for j, ob, v in records
            if j != i and abs(v - vol) < max(1.0, vol * 0.001)]
    print("   other solids with the same volume: %d" % len(same))
    for j, ob in same[:5]:
        inside = "inside body" if not outside(ob) else "also outside"
        print("      #%d  X[%.0f, %.0f] Y[%.0f, %.0f] Z[%.0f, %.0f]  (%s)"
              % (j, ob.XMin, ob.XMax, ob.YMin, ob.YMax, ob.ZMin, ob.ZMax, inside))
    print("", flush=True)
