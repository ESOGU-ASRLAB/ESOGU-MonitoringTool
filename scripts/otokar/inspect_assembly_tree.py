"""Read placed STEP branches, never infer a joint from an assembly bbox."""
import os, json
import FreeCAD, Import, Part

FreeCAD.ParamGet('User parameter:BaseApp/Preferences/Mod/Import/hSTEP').SetBool('ReadShapeCompoundMode', False)
doc = FreeCAD.newDocument('tree')
Import.insert(os.environ['STP_IN'], doc.Name)
rows = []
for obj in doc.Objects:
    shape = getattr(obj, 'Shape', None)
    if shape is None or shape.isNull() or not shape.Solids:
        continue
    box = Part.Compound(shape.Solids).BoundBox
    rows.append(dict(name=obj.Name, label=obj.Label, parents=[p.Name for p in obj.InList],
                     children=[p.Name for p in obj.OutList], solids=len(shape.Solids),
                     bbox=[box.XMin,box.YMin,box.ZMin,box.XMax,box.YMax,box.ZMax],
                     matrix=list(obj.Placement.Matrix.A)))
with open(os.environ['REPORT_JSON'], 'w', encoding='utf-8') as f:
    json.dump(rows,f)
print('AUDIT', os.environ['REPORT_JSON'], len(rows), flush=True)
