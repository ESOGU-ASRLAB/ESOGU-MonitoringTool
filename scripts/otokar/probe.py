import os, sys, time, json, re
from collections import Counter
import FreeCAD, Import, Part

path = os.environ["STP_IN"]
outdir = os.environ.get("STP_OUT")
name = os.path.basename(path)

t0 = time.time()
doc = FreeCAD.newDocument("probe")
# use doc.Name, not the requested label -- FreeCAD uniquifies on collision and
# Import.insert resolves its target by Name, which silently imported into a
# different document when the two diverged.
Import.insert(path, doc.Name)
t1 = time.time()

FINITE = 1e6  # mm; larger => datum plane/axis, not real geometry
real = []
for o in doc.Objects:
    s = getattr(o, "Shape", None)
    if s is None or s.isNull() or len(s.Faces) == 0:
        continue
    bb = s.BoundBox
    if max(abs(bb.XMin), abs(bb.XMax), abs(bb.YMin), abs(bb.YMax)) > FINITE:
        continue
    real.append(o)

shapes = [o.Shape for o in real]
bb = Part.Compound(shapes).BoundBox

def base(lbl):
    return re.sub(r"(_SYM)?\d*$", "", lbl)

info = {
    "file": name,
    "read_sec": round(t1 - t0, 1),
    "parts": len(real),
    "solids": sum(len(s.Solids) for s in shapes),
    "faces": sum(len(s.Faces) for s in shapes),
    "bbox_min": [round(bb.XMin, 3), round(bb.YMin, 3), round(bb.ZMin, 3)],
    "bbox_max": [round(bb.XMax, 3), round(bb.YMax, 3), round(bb.ZMax, 3)],
    "bbox_len": [round(bb.XLength, 3), round(bb.YLength, 3), round(bb.ZLength, 3)],
    "inventory": Counter(base(o.Label) for o in real).most_common(20),
}
print("JSON:" + json.dumps(info, ensure_ascii=False))
if outdir:
    with open(os.path.join(outdir, name + ".json"), "w", encoding="utf-8") as f:
        json.dump(info, f, ensure_ascii=False, indent=2)
