"""Compact placed-solid bounds for STEP assembly root/subassembly Shapes."""
import os
import FreeCAD, Import, Part

doc = FreeCAD.newDocument('roots')
Import.insert(os.environ['STP_IN'], doc.Name)
for obj in doc.Objects:
    shape = getattr(obj, 'Shape', None)
    if shape is None or shape.isNull() or not shape.Solids:
        continue
    if obj.InList:
        continue
    box = Part.Compound(shape.Solids).BoundBox
    if max(abs(box.XMin), abs(box.XMax), abs(box.YMin), abs(box.YMax), abs(box.ZMin), abs(box.ZMax)) > 1e6:
        continue
    print('%-38s solids=%5d min=(%8.1f %8.1f %8.1f) max=(%8.1f %8.1f %8.1f) parents=%s' % (
        obj.Label[:38], len(shape.Solids), box.XMin, box.YMin, box.ZMin,
        box.XMax, box.YMax, box.ZMax, [parent.Name for parent in obj.InList]), flush=True)
