"""Test whether EKSEN2..5 were exported in ONE shared frame.

Loads the axis files into a single document at their native coordinates and
does two independent checks:

  1. SHARED LABELS -- any part label present in two files is compared by bbox.
     Identical coordinates for the same part in two separately exported files
     is only possible if those files share a frame.
  2. JOINT FACE DISTANCE -- true BRep surface distance (distToShape) between
     the mating parts either side of each joint, in native coordinates. If the
     files share a frame the joints already touch and no per-joint correction
     exists to be derived.

A large distance here would mean the files do NOT share a frame, in which case
each needs its own placement and none may be invented from centroids.
"""
import os
import sys
import time
import FreeCAD
import Import
import Part

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
FreeCAD.ParamGet(
    "User parameter:BaseApp/Preferences/Mod/Import/hSTEP"
).SetBool("ReadShapeCompoundMode", False)

RAW = os.environ.get('RAW_DIR', 'raw-cad/otokar')
FILES = ['Robot1_EKSEN2', 'Robot1_EKSEN3', 'Robot1_EKSEN4', 'Robot1_EKSEN5']

doc = FreeCAD.newDocument('chain')
owner = {}          # object Name -> source file stem
by_file = {}        # stem -> {label: object}

for stem in FILES:
    before = {o.Name for o in doc.Objects}
    Import.insert(os.path.join(RAW, stem + '.stp'), doc.Name)
    table = {}
    for o in doc.Objects:
        if o.Name in before:
            continue
        owner[o.Name] = stem
        table.setdefault(o.Label, o)
    by_file[stem] = table
    print('loaded %-18s %d new objects' % (stem, len(table)), flush=True)


def solids_of(obj):
    s = getattr(obj, 'Shape', None)
    if s is None or s.isNull() or not s.Solids:
        return None
    return Part.Compound(s.Solids)


print('\n=== 1. parts appearing in more than one file ===', flush=True)
seen = {}
for stem, table in by_file.items():
    for label in table:
        seen.setdefault(label, []).append(stem)

shared = {k: v for k, v in seen.items() if len(v) > 1}
print('shared labels: %d' % len(shared), flush=True)
for label, stems in sorted(shared.items()):
    boxes = []
    for stem in stems:
        comp = solids_of(by_file[stem][label])
        if comp is None:
            continue
        bb = comp.BoundBox
        boxes.append((stem, bb))
    if len(boxes) < 2:
        continue
    ref = boxes[0][1]
    deltas = []
    for stem, bb in boxes[1:]:
        deltas.append(max(abs(bb.XMin - ref.XMin), abs(bb.YMin - ref.YMin),
                          abs(bb.ZMin - ref.ZMin), abs(bb.XMax - ref.XMax),
                          abs(bb.YMax - ref.YMax), abs(bb.ZMax - ref.ZMax)))
    verdict = 'SAME FRAME' if max(deltas) < 1.0 else 'differs by %.1f mm' % max(deltas)
    print('  %-46s %-28s %s' % (label, '+'.join(stems), verdict), flush=True)
    print('      %s bbox (%.1f %.1f %.1f)..(%.1f %.1f %.1f)' % (
        boxes[0][0], ref.XMin, ref.YMin, ref.ZMin, ref.XMax, ref.YMax, ref.ZMax), flush=True)
    for stem, bb in boxes[1:]:
        print('      %s bbox (%.1f %.1f %.1f)..(%.1f %.1f %.1f)' % (
            stem, bb.XMin, bb.YMin, bb.ZMin, bb.XMax, bb.YMax, bb.ZMax), flush=True)

PAIRS = [
    ('axis2 -> axis3', 'Robot1_EKSEN2', '2_Eksen_Robot_Plakasi_SYM',
     'Robot1_EKSEN3', 'Ic_Konstruksiyon_SYM_rev2'),
    ('axis3 -> axis4', 'Robot1_EKSEN3', 'Ic_Konstruksiyon_SYM_rev2',
     'Robot1_EKSEN4', '4_Eksen_SYM'),
    ('axis4 -> axis5', 'Robot1_EKSEN4', '4_Eksen_Reduktor_Baglanti_Braketi_SYM',
     'Robot1_EKSEN5', '5_Eksen_Reduktor_Baglanti_Braketi_SYM'),
]

print('\n=== 2. joint face distance in NATIVE coordinates (BRep, not bbox) ===', flush=True)
for name, stem_a, label_a, stem_b, label_b in PAIRS:
    a = by_file.get(stem_a, {}).get(label_a)
    b = by_file.get(stem_b, {}).get(label_b)
    if a is None or b is None:
        print('  %-16s MISSING (%s / %s)' % (name, label_a, label_b), flush=True)
        continue
    sa, sb = solids_of(a), solids_of(b)
    if sa is None or sb is None:
        print('  %-16s no solids' % name, flush=True)
        continue
    t0 = time.time()
    try:
        dist, points, _info = sa.distToShape(sb)
    except Exception as exc:
        print('  %-16s distToShape failed: %s' % (name, exc), flush=True)
        continue
    p, q = points[0]
    print('  %-16s %-38s -> %-38s' % (name, label_a, label_b), flush=True)
    print('      surface distance = %.3f mm   (%.1fs)' % (dist, time.time() - t0), flush=True)
    print('      closest points   A(%.1f, %.1f, %.1f)  B(%.1f, %.1f, %.1f)' % (
        p.x, p.y, p.z, q.x, q.y, q.z), flush=True)
