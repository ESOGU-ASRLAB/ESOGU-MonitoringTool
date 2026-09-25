"""Export the three named telescopic stages, in their installed CAD frame.

Inner is bolted to axis2; middle moves half the commanded extension; outer
moves the full extension. The 1:2 synchronization is a declared assumption.
Run with FreeCADCmd. Source STEP files stay untouched.

ROBOT 2'S PLACEMENT IS DERIVED FROM ROBOT 1'S, NOT READ FROM placements.json.

Robot 2 is robot 1 mirrored about the bus's longitudinal centre plane -- that
is what every other part of the machine already is. Measured at the zero pose,
its carriage, column, wrist and camera all sit at robot 1's X with Y reflected
about that plane. Its telescope stages did not: they came out reflected in X as
well, which is a 180 degree turn rather than a mirror, and it left the arm
pointing away from the wrist. The gaps it opened were 126 mm between the column
and the fixed stage and 87 mm between the outer stage and the wrist, and with
the wrist cluster hanging off the end of nothing the camera read as unmounted.

The cause is in the placement, not the geometry. Robot2_EKSEN3's stage solids
are Robot1_EKSEN3's REFLECTED IN Y and translated -- measured at both ends of
every stage's bounding box, y2 = -y1 - 26.4 and x2 = x1 - 14121.0 -- so the
mirror is already half done in the file, and the matrix has to supply the X
flip that completes it. Robot2_EKSEN3's own matrix does not: it leaves X alone,
which turns the arm end-for-end instead of mirroring it.

(A first pass here assumed the two files were related by a pure TRANSLATION.
The guard below caught it -- the three stages disagreed by 132 mm in Y -- which
is why the relationship is measured as a reflection and checked rather than
asserted.)

So rather than carry a second hand-written matrix that has to agree with the
first, robot 2's is composed here:

    R2 = MIRROR_ABOUT_BUS_PLANE . R1 . FILE_TO_FILE^-1

FILE_TO_FILE is measured from the two files' own solids at full precision, and
the stages have to agree on it or this refuses to run. Nothing is typed in that
could drift out of step with the CAD.
"""
import os, sys, json
import FreeCAD, Import, Part
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from glbwrite import write_glb

root = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
placements = json.load(open(os.path.join(root, 'scripts/otokar/placements.json')))
FreeCAD.ParamGet('User parameter:BaseApp/Preferences/Mod/Import/hSTEP').SetBool('ReadShapeCompoundMode', False)

STAGES = [('Ic_Konstruksiyon', 'axis3_fixed'),
          ('Orta_Konstruksiyon', 'axis3_middle'),
          ('Dis_Konstruksiyon', 'axis3_outer')]

# The bus's longitudinal centre plane, in the cell's CAD frame. Same derivation
# as OtokarBusBody.js: rail inner face - measured side clearance - body half
# width. Robot 2 is robot 1 reflected in this plane.
BUS_CENTRELINE_Y_MM = 2757.4 - 1643.6612 - 1251.0
# Both ends of the datum stage's bbox have to agree this closely, in mm, or the
# transform is not the reflection-plus-translation composed below.
OFFSET_TOL_MM = 0.05
# How far a MOVING stage may sit from the datum's answer. This is a sanity
# bound on the datum, not a second measurement: the datum stage fits its two
# ends to 0.0000 mm, while the middle stage comes out 18.8 mm off in Z because
# the two exports do not hold the same solids for it (335 against 337) and a
# telescope stage can also be captured at a different extension in each file.
# Tens of millimetres is that; hundreds would mean a different transform, which
# is what this is here to stop.
STAGE_TOL_MM = 40.0


def stage_shapes(stem):
    doc = FreeCAD.newDocument(stem)
    Import.insert(os.path.join(root, 'raw-cad/otokar', stem + '.stp'), doc.Name)
    out = {}
    for prefix, part in STAGES:
        hits = [o for o in doc.Objects if o.Label.startswith(prefix)]
        if len(hits) != 1:
            raise RuntimeError('%s: expected one %s, found %d: %s'
                               % (stem, prefix, len(hits), [o.Label for o in hits]))
        out[part] = (hits[0].Label, Part.Compound(hits[0].Shape.Solids))
    return doc, out


doc1, stages1 = stage_shapes('Robot1_EKSEN3')
doc2, stages2 = stage_shapes('Robot2_EKSEN3')

# How Robot2_EKSEN3's solids relate to Robot1_EKSEN3's, measured rather than
# assumed: a reflection in the files' local Y plus a translation. Both ends of
# a bounding box must give the same answer for it to be that transform at all.
#
# The FIXED stage is the datum. It is bolted to the column, so it is the one
# stage whose position cannot depend on how far the telescope happened to be
# extended when each file was exported; the moving stages are checked against
# it but do not set it.
def file_to_file(stage_part):
    b1 = stages1[stage_part][1].BoundBox
    b2 = stages2[stage_part][1].BoundBox
    # x2 = x1 + tx, y2 = -y1 + ty, z2 = z1 + tz, each read at both ends.
    tx = [b2.XMin - b1.XMin, b2.XMax - b1.XMax]
    ty = [b2.YMin + b1.YMax, b2.YMax + b1.YMin]
    tz = [b2.ZMin - b1.ZMin, b2.ZMax - b1.ZMax]
    return [tx, ty, tz]


DATUM = 'axis3_fixed'
datum = file_to_file(DATUM)
datum_spread = [abs(pair[0] - pair[1]) for pair in datum]
t = [(pair[0] + pair[1]) / 2 for pair in datum]
print('File-to-file transform from %s: y2 = -y1 + (%.4f), x2 = x1 + (%.4f), z2 = z1 + (%.4f); '
      'ends disagree by (%.4f, %.4f, %.4f) mm'
      % (DATUM, t[1], t[0], t[2], datum_spread[0], datum_spread[1], datum_spread[2]), flush=True)
if max(datum_spread) > OFFSET_TOL_MM:
    raise RuntimeError('%s is not a Y-reflection plus translation between the two files '
                       '(ends disagree by %s mm); derive the placement another way.'
                       % (DATUM, datum_spread))

# The moving stages should agree with the datum to within the parts' own small
# differences -- the two exports do not contain byte-identical solids (335 vs
# 337 for the middle stage). A few millimetres is that; a hundred is a different
# transform, and worth stopping for.
for _, part in STAGES:
    if part == DATUM:
        continue
    other = file_to_file(part)
    delta = [abs((pair[0] + pair[1]) / 2 - t[i]) for i, pair in enumerate(other)]
    print('  %-14s residual against the datum: (%.2f, %.2f, %.2f) mm'
          % (part, delta[0], delta[1], delta[2]), flush=True)
    if max(delta) > STAGE_TOL_MM:
        raise RuntimeError('%s disagrees with %s by %s mm; the two files are not the same '
                           'assembly in the same pose.' % (part, DATUM, delta))

r1 = FreeCAD.Matrix(*placements['sources']['Robot1_EKSEN3']['matrix'])
# Inverse of the file-to-file transform: robot 1's local coordinates, expressed
# in robot 2's. A Y-reflection is its own inverse apart from the offset.
inverse = FreeCAD.Matrix()
inverse.A11, inverse.A22, inverse.A33 = 1.0, -1.0, 1.0
inverse.A14, inverse.A24, inverse.A34 = -t[0], t[1], -t[2]
mirror = FreeCAD.Matrix()
mirror.A22 = -1.0                                   # y -> -y ...
mirror.A24 = 2.0 * BUS_CENTRELINE_Y_MM              # ... about the bus plane
r2 = mirror.multiply(r1).multiply(inverse)
print('Robot2 stage placement derived: %s' % [round(v, 4) for v in list(r2.A)], flush=True)

MATRICES = {
    1: (r1, 'Robot1_EKSEN3 placement from placements.json (EKSEN2/EKSEN3 share a master frame).'),
    2: (r2, "DERIVED, not read from placements.json: robot 1's placement, reflected about "
            "the bus centre plane at cell Y = %.4f mm, composed with the inverse of the "
            "measured file-to-file transform (y2 = -y1 + %.4f, x2 = x1 + %.4f, z2 = z1 + %.4f, "
            "read off the fixed stage). Robot2_EKSEN3's own matrix leaves X un-flipped, "
            "which turns the arm end-for-end instead of mirroring it and opens 126 mm at the "
            "column and 87 mm at the wrist."
            % (BUS_CENTRELINE_Y_MM, t[1], t[0], t[2])),
}

manifest = {'middleTravelRatio': 0.5,
            'status': 'Ratio assumed; named stages and mount faces from STEP',
            'busCentrelineYmm': BUS_CENTRELINE_Y_MM,
            'robot2FileToFile': {'yReflected': True, 'translationMm': t, 'datumStage': DATUM},
            'stages': []}

for rid, stages in ((1, stages1), (2, stages2)):
    stem = 'Robot%d_EKSEN3' % rid
    matrix, provenance = MATRICES[rid]
    for _, part in STAGES:
        label, shape = stages[part]
        entry = dict(robot='robot%d' % rid, part=part, source=stem + '.stp', label=label,
                     matrix=list(matrix.A), solids=len(shape.Solids), provenance=provenance)
        for tier, deflection in [('hi', 6), ('lo', 20)]:
            pts, faces = shape.tessellate(deflection)
            positions = []
            for p in pts:
                q = matrix.multiply(p)
                positions.extend([q.x * .001, q.y * .001, q.z * .001])
            indices = [i for face in faces for i in face]
            path = os.path.join(root, 'client/public/meshes/otokar/robot%d' % rid, tier, part + '.glb')
            write_glb(path, positions, indices)
            print('EXPORTED', path, len(faces), flush=True)
        manifest['stages'].append(entry)

for doc in (doc1, doc2):
    FreeCAD.closeDocument(doc.Name)

with open(os.path.join(root, 'client/public/meshes/otokar/telescopic.json'), 'w') as f:
    json.dump(manifest, f, indent=2)
print('WROTE telescopic.json', flush=True)
