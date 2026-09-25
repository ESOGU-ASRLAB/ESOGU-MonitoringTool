"""What is supposed to hold the bus up?

The body's underside sits at cell Z +278. The vehicle supports along the rail
bed -- Stoper_Takozu and its rubber pads -- stop at Z -843. That is a 1 121 mm
gap, and it is why the bus appears to hang in mid-air.

Before inventing anything to fill it, this asks whether the real support is
already in the CAD and simply not being drawn. Two ways it could be hidden:

  DROP_NAME_RE  the fastener filter drops anything matching `saplama` (stud),
                among others. The posts in Otokar's own renders have tall studs
                standing on them, and a stud is exactly what would bridge this.
  MIN_PART_MM   parts below the size cut are dropped outright.

So: every solid in EKSEN1 that reaches up toward the body, whatever its name,
with what would have filtered it out.

  "/c/Program Files/FreeCAD 1.1/bin/freecadcmd.exe" scripts/otokar/inspect_bus_supports.py
"""
import os, re
import FreeCAD, Import, Part

FreeCAD.ParamGet('User parameter:BaseApp/Preferences/Mod/Import/hSTEP').SetBool(
    'ReadShapeCompoundMode', False)

root = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
src = os.environ.get('STP_IN', os.path.join(root, 'raw-cad/otokar/Robot1_EKSEN1.stp'))

DROP_NAME_RE = re.compile(
    'civata|somun|saplama|pim_|_pim|imbus|alyan|rondela|washer|screw|bolt|feder|dowel', re.I)
MIN_PART_MM = 25.0
# The body's underside, in the cell frame: rail foot top + the measured ride
# height. Anything reaching toward this is a candidate support.
BODY_UNDERSIDE_Z = -1368.0 + 1646.2384

doc = FreeCAD.newDocument('supports')
Import.insert(src, doc.Name)
print('imported objects: %d' % len(doc.Objects), flush=True)

rows = []
for o in doc.Objects:
    s = getattr(o, 'Shape', None)
    if s is None or s.isNull() or not getattr(s, 'Solids', None):
        continue
    bb = Part.Compound(s.Solids).BoundBox
    if max(abs(bb.XMin), abs(bb.XMax), abs(bb.YMin), abs(bb.YMax), abs(bb.ZMin), abs(bb.ZMax)) > 1e6:
        continue
    rows.append((o, bb, len(s.Solids)))

print('\nEverything reaching above Z -843 (the top of the supports as drawn),')
print('sorted by how high it gets. The body needs something at Z %.0f.\n' % BODY_UNDERSIDE_Z)
rows.sort(key=lambda r: -r[1].ZMax)
shown = 0
for o, bb, n in rows:
    if bb.ZMax < -843:
        continue
    shown += 1
    if shown > 25:
        break
    why = []
    if DROP_NAME_RE.search(o.Label):
        why.append('DROPPED by name')
    if bb.DiagonalLength < MIN_PART_MM:
        why.append('DROPPED as too small')
    print('  Zmax=%8.0f Zmin=%8.0f  %-40s solids=%4d  h=%6.0f  %s'
          % (bb.ZMax, bb.ZMin, o.Label, n, bb.ZLength,
             '; '.join(why) if why else 'kept'), flush=True)

print('\nAnything the fastener filter drops that stands more than 300 mm tall:')
tall = [(o, bb) for o, bb, n in rows
        if DROP_NAME_RE.search(o.Label) and bb.ZLength > 300]
if not tall:
    print('  none -- the filter is not what is hiding the support.')
for o, bb in sorted(tall, key=lambda r: -r[1].ZLength)[:15]:
    print('  %-40s  Z[%8.0f, %8.0f]  h=%6.0f  Y[%7.0f, %7.0f]'
          % (o.Label, bb.ZMin, bb.ZMax, bb.ZLength, bb.YMin, bb.YMax), flush=True)
