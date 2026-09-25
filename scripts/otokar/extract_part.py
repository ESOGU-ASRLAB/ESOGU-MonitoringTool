"""Extract named sub-assemblies from a STEP file for standalone inspection.

Prints each target's part tree (child labels + bboxes) and writes a JSON mesh
for scripts/otokar/render_part.mjs. Used to identify what an unknown named
assembly actually IS -- in its own geometry, away from the rest of the
machine -- before deciding to use, move or hide it.

  STP_IN       source .stp
  PART_LABELS  comma-separated object labels to extract
  JSON_OUT     destination .json
  DEFLECTION   tessellation deflection in mm (default 8)

Run with freecadcmd. ReadShapeCompoundMode is forced off: FreeCAD's default
fuses the whole STEP assembly into one unnamed Part::Feature, which destroys
the per-part labels this tool exists to look up.
"""
import os
import sys
import json
import base64
import struct
import FreeCAD
import Import
import Part

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
FreeCAD.ParamGet(
    "User parameter:BaseApp/Preferences/Mod/Import/hSTEP"
).SetBool("ReadShapeCompoundMode", False)

src = os.environ['STP_IN']
labels = [s for s in os.environ['PART_LABELS'].split(',') if s]
out = os.environ['JSON_OUT']
deflection = float(os.environ.get('DEFLECTION', '8'))

doc = FreeCAD.newDocument('extract')
Import.insert(src, doc.Name)


def parents(obj):
    stack = list(obj.InList)
    seen = set()
    while stack:
        p = stack.pop()
        if p.Name in seen:
            continue
        seen.add(p.Name)
        yield p
        stack.extend(p.InList)


by_label = {}
for o in doc.Objects:
    by_label.setdefault(o.Label, o)

parts = []
for label in labels:
    target = by_label.get(label)
    if target is None:
        print('NOT FOUND: %s' % label, flush=True)
        continue
    solids = target.Shape.Solids
    if not solids:
        print('NO SOLIDS: %s' % label, flush=True)
        continue
    comp = Part.Compound(solids)
    bb = comp.BoundBox
    points, facets = comp.tessellate(deflection)

    flat = []
    for p in points:
        flat.extend((p.x, p.y, p.z))
    idx = []
    for f in facets:
        idx.extend((f[0], f[1], f[2]))

    kids = []
    for o in doc.Objects:
        if o is target:
            continue
        s = getattr(o, 'Shape', None)
        if s is None or s.isNull() or not s.Solids:
            continue
        if any(a.Name == target.Name for a in parents(o)):
            kb = Part.Compound(s.Solids).BoundBox
            kids.append({
                'label': o.Label,
                'bbox': [round(v, 1) for v in
                         (kb.XMin, kb.YMin, kb.ZMin, kb.XMax, kb.YMax, kb.ZMax)],
            })

    print('=== %s ===' % label, flush=True)
    print('  solids=%d  triangles=%d' % (len(solids), len(facets)), flush=True)
    print('  bbox mm (%.1f %.1f %.1f) .. (%.1f %.1f %.1f)  size %.1f x %.1f x %.1f'
          % (bb.XMin, bb.YMin, bb.ZMin, bb.XMax, bb.YMax, bb.ZMax,
             bb.XLength, bb.YLength, bb.ZLength), flush=True)
    print('  children carrying solids: %d' % len(kids), flush=True)
    for k in sorted(kids, key=lambda k: k['label']):
        print('    %-46s (%s)' % (k['label'], ', '.join(str(v) for v in k['bbox'])),
              flush=True)

    parts.append({
        'label': label,
        'solids': len(solids),
        'triangles': len(facets),
        'bbox': [bb.XMin, bb.YMin, bb.ZMin, bb.XMax, bb.YMax, bb.ZMax],
        'children': [k['label'] for k in sorted(kids, key=lambda k: k['label'])],
        'positions': base64.b64encode(
            struct.pack('<%df' % len(flat), *flat)).decode('ascii'),
        'indices': base64.b64encode(
            struct.pack('<%dI' % len(idx), *idx)).decode('ascii'),
    })

with open(out, 'w', encoding='utf-8') as f:
    json.dump({'source': os.path.basename(src), 'parts': parts}, f)
print('WROTE %s (%d parts)' % (out, len(parts)), flush=True)
