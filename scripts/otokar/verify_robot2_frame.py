"""Check that Robot2_EKSEN2 sits in Robot2's column master frame.

Robot 1's EKSEN2..5 are written in the axis-2 column's master frame, and the
column's placement inside EKSEN1 maps them onto the installed frame. This tests
the same claim for Robot 2 by measurement rather than analogy: translate
EKSEN2's geometry by 2_eksen_sabit's placement and see whether its base plate
lands on the carriage, the way Robot 1's did to 0.40 mm.
"""
import os
import sys
import FreeCAD
import Import
import Part

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
FreeCAD.ParamGet(
    "User parameter:BaseApp/Preferences/Mod/Import/hSTEP"
).SetBool("ReadShapeCompoundMode", False)

RAW = 'raw-cad/otokar'
doc = FreeCAD.newDocument('r2')

Import.insert(os.path.join(RAW, 'Robot2_EKSEN1.stp'), doc.Name)
e1_names = {o.Name for o in doc.Objects}
Import.insert(os.path.join(RAW, 'Robot2_EKSEN2.stp'), doc.Name)


def solids_of(obj):
    s = getattr(obj, 'Shape', None)
    if s is None or s.isNull() or not s.Solids:
        return None
    return Part.Compound(s.Solids)


e1, e2 = {}, {}
for o in doc.Objects:
    (e1 if o.Name in e1_names else e2).setdefault(o.Label, o)

print('EKSEN2 objects: %d' % len(e2), flush=True)
for label, o in sorted(e2.items()):
    comp = solids_of(o)
    if comp is None or comp.BoundBox.DiagonalLength < 300:
        continue
    bb = comp.BoundBox
    print('  %-44s (%.1f %.1f %.1f)..(%.1f %.1f %.1f)' % (
        label, bb.XMin, bb.YMin, bb.ZMin, bb.XMax, bb.YMax, bb.ZMax), flush=True)

# 2_eksen_sabit's placement inside Robot2_EKSEN1: the candidate transform.
col = e1.get('2_eksen_sabit')
print('\n2_eksen_sabit placement: %s' % (col.Placement,), flush=True)
shift = col.Placement.Base

carriage = solids_of(e1.get('1_eksen_hareketli'))
cb = carriage.BoundBox
print('carriage (placed) bbox (%.1f %.1f %.1f)..(%.1f %.1f %.1f)' % (
    cb.XMin, cb.YMin, cb.ZMin, cb.XMax, cb.YMax, cb.ZMax), flush=True)

target = os.environ.get('E2_LABEL', '')
candidates = [target] if target else [l for l in e2 if 'Taban' in l or 'Plaka' in l]
print('\nafter translating EKSEN2 by the column placement:', flush=True)
for label in candidates:
    o = e2.get(label)
    if o is None:
        continue
    comp = solids_of(o)
    if comp is None:
        continue
    moved = comp.copy()
    moved.translate(shift)
    bb = moved.BoundBox
    try:
        dist, pts, _ = carriage.distToShape(moved)
        p, q = pts[0]
        near = 'dist %.3f mm at A(%.1f, %.1f, %.1f) B(%.1f, %.1f, %.1f)' % (
            dist, p.x, p.y, p.z, q.x, q.y, q.z)
    except Exception as exc:
        near = 'distToShape failed: %s' % exc
    print('  %-44s (%.1f %.1f %.1f)..(%.1f %.1f %.1f)\n      %s' % (
        label, bb.XMin, bb.YMin, bb.ZMin, bb.XMax, bb.YMax, bb.ZMax, near), flush=True)
