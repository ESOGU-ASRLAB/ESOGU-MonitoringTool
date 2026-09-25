"""Dump every non-fastener, in-crop-band named part from one STEP file, sorted
by Z, so mating-interface parts (base plates, mounting brackets, reducer
flanges) can be identified by eye across a joint boundary.

Run with freecadcmd and STP_IN=<path>. Mirrors convert.py's own crop
(|Y|<=6000mm) and fastener size floor (80mm diagonal) so the list matches
what actually ships in the GLB.
"""
import os
import sys
import FreeCAD, Import, Part

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

FreeCAD.ParamGet("User parameter:BaseApp/Preferences/Mod/Import/hSTEP").SetBool("ReadShapeCompoundMode", False)

doc = FreeCAD.newDocument('audit')
Import.insert(os.environ['STP_IN'], doc.Name)

crop_axis = os.environ.get('CROP_AXIS', 'y')
crop_lo = float(os.environ.get('CROP_LO', '-6000'))
crop_hi = float(os.environ.get('CROP_HI', '6000'))

rows = []
for o in doc.Objects:
    s = getattr(o, 'Shape', None)
    if s is None or s.isNull() or not s.Solids:
        continue
    bb = Part.Compound(s.Solids).BoundBox
    if max(abs(bb.XMin), abs(bb.XMax), abs(bb.YMin), abs(bb.YMax), abs(bb.ZMin), abs(bb.ZMax)) > 1e6:
        continue
    crop_val = {'x': bb.Center.x, 'y': bb.Center.y, 'z': bb.Center.z}[crop_axis]
    if not (crop_lo <= crop_val <= crop_hi):
        continue
    if bb.DiagonalLength < 80:
        continue
    rows.append((bb.Center.z, o.Label, bb))

rows.sort(key=lambda r: r[0])
print('TOTAL PARTS:', len(rows))
for z, label, bb in rows:
    print('%-48s bbox=(%9.1f %9.1f %9.1f)..(%9.1f %9.1f %9.1f) center=(%8.1f %8.1f %8.1f)' % (
        label, bb.XMin, bb.YMin, bb.ZMin, bb.XMax, bb.YMax, bb.ZMax,
        bb.Center.x, bb.Center.y, bb.Center.z), flush=True)
