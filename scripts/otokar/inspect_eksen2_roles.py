"""What inside EKSEN2 moves with axis 2, and what is bolted to the carriage?

`axis2` is mounted inside the axis-2 group, so everything in that mesh rises and
falls with the commanded column height. Measured against the floor rail, that is
wrong for part of it: at a2 = 0 the mesh reaches down to cell Z -1368 -- the
factory floor -- and clears the rail by 134 mm, but by a2 = 400 that same
structure has risen into the rail and the gap is 0 mm. Structure standing on the
floor does not ride the slide; it belongs with the carriage, the way EKSEN1 is
already split into runway and carriage and EKSEN3 into its three stages.

This lists EKSEN2's parts with their heights so the split can be made by name,
which is how convert.py's AXIS1_ROLE test already works.

  "/c/Program Files/FreeCAD 1.1/bin/freecadcmd.exe" scripts/otokar/inspect_eksen2_roles.py
"""
import os
import FreeCAD, Import, Part

FreeCAD.ParamGet('User parameter:BaseApp/Preferences/Mod/Import/hSTEP').SetBool('ReadShapeCompoundMode', False)

root = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
src = os.environ.get('STP_IN', os.path.join(root, 'raw-cad/otokar/Robot1_EKSEN2.stp'))

doc = FreeCAD.newDocument('e2roles')
Import.insert(src, doc.Name)
print('imported objects: %d' % len(doc.Objects), flush=True)

top = next(o for o in doc.Objects if not o.InList)
print('root: %s (%d solids)' % (top.Label, len(top.Shape.Solids)), flush=True)

rows = []
for o in doc.Objects:
    s = getattr(o, 'Shape', None)
    if s is None or s.isNull() or not getattr(s, 'Solids', None):
        continue
    bb = Part.Compound(s.Solids).BoundBox
    if max(abs(bb.XMin), abs(bb.XMax), abs(bb.YMin), abs(bb.YMax), abs(bb.ZMin), abs(bb.ZMax)) > 1e6:
        continue
    rows.append((o, bb, len(s.Solids)))

# Sorted by how far down each part reaches: the ones standing on the floor come
# first, and those are the candidates for the static column.
rows.sort(key=lambda r: r[1].ZMin)
print('\nparts by how LOW they reach (native EKSEN2 frame; the export places the')
print('floor at Z = -1368 once the placement is applied):')
for o, bb, n in rows[:30]:
    parents = ','.join(p.Label for p in o.InList)[:34]
    print('  Zmin=%8.0f Zmax=%8.0f  %-40s solids=%4d  X[%7.0f,%7.0f] Y[%8.0f,%8.0f]  parents=%s'
          % (bb.ZMin, bb.ZMax, o.Label, n, bb.XMin, bb.XMax, bb.YMin, bb.YMax, parents), flush=True)

print('\ndirect children of the root:')
for child in top.OutList:
    s = getattr(child, 'Shape', None)
    if s is None or s.isNull() or not getattr(s, 'Solids', None):
        print('  %-40s (no solids)' % child.Label)
        continue
    bb = Part.Compound(s.Solids).BoundBox
    print('  %-40s solids=%4d  Z[%8.0f,%8.0f]  X[%7.0f,%7.0f] Y[%8.0f,%8.0f]'
          % (child.Label, len(s.Solids), bb.ZMin, bb.ZMax, bb.XMin, bb.XMax, bb.YMin, bb.YMax), flush=True)
