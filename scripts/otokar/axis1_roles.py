"""Which EKSEN1 parts go to the static runway, and which ride the carriage?

convert.py splits Robot?_EKSEN1.stp into two meshes by branch name: anything
under `1_Eksen_Hareketli` or `2_Eksen_Sabit` becomes `axis1_carriage` and moves
with axis 1, everything else becomes `axis1` and never moves. That is a NAME
test, so a part that physically rides the rail but does not sit under one of
those two branches ends up welded to the floor.

This replicates the same selection and prints what lands in each role, with
bounding boxes, so a part sitting inside the rail trough in the static mesh is
visible as a name rather than as something odd on screen.

  STP_IN=raw-cad/otokar/Robot1_EKSEN1.stp \
  "/c/Program Files/FreeCAD 1.1/bin/freecadcmd.exe" scripts/otokar/axis1_roles.py
"""
import os, re
import FreeCAD, Import, Part

src = os.environ.get('STP_IN', 'raw-cad/otokar/Robot1_EKSEN1.stp')
if not os.path.isabs(src):
    src = os.path.join(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')), src)

# Same knobs convert.py runs EKSEN1 with (see build_otokar_meshes.sh).
MIN_PART_MM = 25.0
DROP_NAME_RE = re.compile(
    'civata|somun|saplama|pim_|_pim|imbus|alyan|rondela|washer|screw|bolt|feder|dowel', re.I)
CROP = (-99000, 99000, -6000, 6000, -99000, 99000)
FINITE = 1e6
CARRIAGE_BRANCHES = {'1_eksen_hareketli', '2_eksen_sabit'}
EKSEN1_ROOT = '1_eksen'

doc = FreeCAD.newDocument('roles')
Import.insert(src, doc.Name)
print('imported objects: %d' % len(doc.Objects), flush=True)


def ancestors(obj):
    stack = list(obj.InList)
    seen = set()
    while stack:
        parent = stack.pop()
        if parent.Name in seen:
            continue
        seen.add(parent.Name)
        yield parent
        stack.extend(parent.InList)


def branch_key(label):
    return label.lower().removesuffix('_sym')


def role_of(obj):
    labels = {branch_key(obj.Label)} | {branch_key(p.Label) for p in ancestors(obj)}
    return 'carriage' if labels & CARRIAGE_BRANCHES else 'runway'


eligible, boxes = {}, {}
for o in doc.Objects:
    if branch_key(o.Label) == EKSEN1_ROOT:
        eligible[o.Name] = False
        continue
    s = getattr(o, 'Shape', None)
    if s is None or s.isNull() or len(s.Faces) == 0 or not getattr(s, 'Solids', None):
        eligible[o.Name] = False
        continue
    bb = s.BoundBox
    if max(abs(bb.XMin), abs(bb.XMax), abs(bb.YMin), abs(bb.YMax), abs(bb.ZMin), abs(bb.ZMax)) > FINITE:
        bb = Part.Compound(s.Solids).BoundBox
        if max(abs(bb.XMin), abs(bb.XMax), abs(bb.YMin), abs(bb.YMax), abs(bb.ZMin), abs(bb.ZMax)) > FINITE:
            eligible[o.Name] = False
            continue
    boxes[o.Name] = bb
    c = bb.Center
    if not (CROP[0] <= c.x <= CROP[1] and CROP[2] <= c.y <= CROP[3] and CROP[4] <= c.z <= CROP[5]):
        eligible[o.Name] = False
        continue
    if bb.DiagonalLength < MIN_PART_MM or DROP_NAME_RE.search(o.Label):
        eligible[o.Name] = False
        continue
    eligible[o.Name] = True

written = [o for o in doc.Objects
           if eligible.get(o.Name) and not any(eligible.get(p.Name) for p in ancestors(o))]

for role in ('runway', 'carriage'):
    group = [o for o in written if role_of(o) == role]
    print('\n===== %s: %d part(s)' % (role.upper(), len(group)), flush=True)
    for o in sorted(group, key=lambda o: -boxes[o.Name].XLength):
        bb = boxes[o.Name]
        print('  %-34s X[%9.0f,%9.0f] Y[%8.0f,%8.0f] Z[%8.0f,%8.0f]  size %7.0f x %6.0f x %6.0f'
              % (o.Label, bb.XMin, bb.XMax, bb.YMin, bb.YMax, bb.ZMin, bb.ZMax,
                 bb.XLength, bb.YLength, bb.ZLength), flush=True)
        print('       parents: %s' % ', '.join(p.Label for p in o.InList), flush=True)
