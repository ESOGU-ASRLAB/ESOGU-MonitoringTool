"""Find a STEP file's lowest-Z (bottom / mounting-face) named parts.

Used to derive AXIS2_FRAME_CORRECTION_MM in OtokarGantryRobot.js: separately
exported EKSEN*.stp files do not share a common origin, so aligning axis N+1
onto axis N needs a SPECIFIC mounting-interface part on each side (e.g.
"2_Eksen_Robot_Plakasi_SYM" on EKSEN2, matched against "_1_Eksen_Hareketli_SYM"
on EKSEN1), not the whole assembly's bbox centre -- centroid-matching a
STACKED joint (one part standing on top of another) puts them offset by half
each part's own height instead of touching face-to-face. See the
AXIS2_FRAME_CORRECTION_MM comment for how the result was used, and
docs/otokar-cad-notes.md for the full writeup.

Run with freecadcmd and STP_IN=<path to the .stp being inspected>. Crops to
the installed copy (Y within +/-6000mm) the same way convert.py does, and
drops fasteners by size (<80mm diagonal) so real structural parts sort to the
top of the list.
"""
import os
import FreeCAD, Import, Part

doc = FreeCAD.newDocument('mount')
Import.insert(os.environ['STP_IN'], doc.Name)

parts = []
for o in doc.Objects:
    s = getattr(o, 'Shape', None)
    if s is None or s.isNull() or not s.Solids:
        continue
    bb = Part.Compound(s.Solids).BoundBox
    if max(abs(bb.XMin), abs(bb.XMax), abs(bb.YMin), abs(bb.YMax)) > 1e6:
        continue
    if not (-6000 <= bb.Center.y <= 6000):
        continue
    if bb.DiagonalLength < 80:
        continue
    parts.append((o.Label, bb.ZMin, bb.ZMax, bb.XMin, bb.XMax, bb.YMin, bb.YMax))

parts.sort(key=lambda p: p[1])
print('lowest-Z (bottom) parts:')
for p in parts[:12]:
    print('  %-40s Z(%.0f..%.0f) X(%.0f..%.0f) Y(%.0f..%.0f)' % p)
