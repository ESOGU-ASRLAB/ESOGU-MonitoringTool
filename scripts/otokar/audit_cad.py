"""Inventory installed Robot1 parts, including energy chains, under FreeCAD.

OTOKAR_RAW_CAD and OTOKAR_AUDIT_OUT point to local confidential input/output.
This inventories component completeness; established bus/rail datums are not
re-derived here. Robot2 axis exports are deliberately never imported.
"""
import json, os, re
import FreeCAD, Import

source = os.environ['OTOKAR_RAW_CAD']
outdir = os.environ['OTOKAR_AUDIT_OUT']
os.makedirs(outdir, exist_ok=True)
for axis in range(1, 6):
    doc = FreeCAD.newDocument('audit')
    Import.insert(os.path.join(source, 'Robot1_EKSEN%d.stp' % axis), doc.Name)
    parts = []
    for obj in doc.Objects:
        shape = getattr(obj, 'Shape', None)
        if shape is None or shape.isNull() or not shape.Faces:
            continue
        bb = shape.BoundBox
        if max(abs(bb.XMin), abs(bb.XMax), abs(bb.YMin), abs(bb.YMax)) > 1e6:
            continue
        if not -6000 <= bb.Center.y <= 6000:
            continue
        parts.append(dict(name=obj.Name, label=obj.Label,
                          min=[bb.XMin, bb.YMin, bb.ZMin], max=[bb.XMax, bb.YMax, bb.ZMax],
                          diagonal=bb.DiagonalLength, faces=len(shape.Faces),
                          parents=[p.Name for p in obj.InList]))
    with open(os.path.join(outdir, 'axis%d.json' % axis), 'w', encoding='utf8') as handle:
        json.dump(parts, handle, ensure_ascii=False, indent=2)
    print('AUDIT axis%d: %d parts' % (axis, len(parts)), flush=True)
    FreeCAD.closeDocument(doc.Name)
