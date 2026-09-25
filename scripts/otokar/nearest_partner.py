"""Find which part of one STEP file actually mates with a part of another.

Computes true BRep surface distance from a target part to every sizable part of
the other file and reports the closest ones, so a joint's mating pair is found
by measurement instead of by guessing at Turkish part names.

  STP_A / LABEL_A   the target part
  STP_B             the file to search
  MIN_DIAG          ignore parts below this bbox diagonal (default 80mm)
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

doc = FreeCAD.newDocument('near')
before = set()
Import.insert(os.environ['STP_A'], doc.Name)
a_names = {o.Name for o in doc.Objects}
Import.insert(os.environ['STP_B'], doc.Name)

min_diag = float(os.environ.get('MIN_DIAG', '80'))
label_a = os.environ['LABEL_A']


def solids_of(obj):
    s = getattr(obj, 'Shape', None)
    if s is None or s.isNull() or not s.Solids:
        return None
    return Part.Compound(s.Solids)


target = None
for o in doc.Objects:
    if o.Name in a_names and o.Label == label_a:
        target = o
        break
if target is None:
    raise SystemExit('target not found: ' + label_a)

ts = solids_of(target)
print('target %s from %s' % (label_a, os.path.basename(os.environ['STP_A'])), flush=True)

results = []
for o in doc.Objects:
    if o.Name in a_names:
        continue
    comp = solids_of(o)
    if comp is None or comp.BoundBox.DiagonalLength < min_diag:
        continue
    try:
        dist, points, _ = ts.distToShape(comp)
    except Exception:
        continue
    results.append((dist, o.Label, points[0]))

results.sort(key=lambda r: r[0])
print('closest %d parts in %s:' % (min(10, len(results)), os.path.basename(os.environ['STP_B'])), flush=True)
for dist, label, (p, q) in results[:10]:
    print('  %9.3f mm  %-46s  A(%.1f, %.1f, %.1f)  B(%.1f, %.1f, %.1f)' % (
        dist, label, p.x, p.y, p.z, q.x, q.y, q.z), flush=True)
