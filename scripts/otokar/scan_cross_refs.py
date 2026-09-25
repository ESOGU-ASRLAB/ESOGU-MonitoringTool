"""Scan a STEP file for objects whose label references ANOTHER axis assembly.

Used to find the placed instance of a downstream root inside its upstream file
-- the thing that carries the real native->installed matrix, the way
2_Eksen_Sabit_SYM does for EKSEN2 inside EKSEN1. Prints the placement of every
hit so a match can be turned into a transform directly.

  STP_IN    source .stp
  PATTERN   regex matched against object labels (case-insensitive)
"""
import os
import re
import sys
import FreeCAD
import Import
import Part

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
FreeCAD.ParamGet(
    "User parameter:BaseApp/Preferences/Mod/Import/hSTEP"
).SetBool("ReadShapeCompoundMode", False)

doc = FreeCAD.newDocument('scan')
Import.insert(os.environ['STP_IN'], doc.Name)
rx = re.compile(os.environ['PATTERN'], re.I)

print('--- %s ---' % os.path.basename(os.environ['STP_IN']), flush=True)
hits = 0
for o in doc.Objects:
    if not rx.search(o.Label):
        continue
    hits += 1
    pl = o.Placement
    ident = pl.Base.Length < 1e-6 and pl.Rotation.Angle < 1e-9
    s = getattr(o, 'Shape', None)
    bb = None
    if s is not None and not s.isNull() and s.Solids:
        bb = Part.Compound(s.Solids).BoundBox
    print('  %-44s %-18s placement=%s' % (
        o.Label, o.TypeId.replace('App::', '').replace('Part::', ''),
        'IDENTITY' if ident else 'pos(%.3f, %.3f, %.3f) rot %.2f deg about (%.3f, %.3f, %.3f)' % (
            pl.Base.x, pl.Base.y, pl.Base.z,
            pl.Rotation.Angle * 180.0 / 3.141592653589793,
            pl.Rotation.Axis.x, pl.Rotation.Axis.y, pl.Rotation.Axis.z)), flush=True)
    if bb is not None:
        print('      bbox (%.1f %.1f %.1f)..(%.1f %.1f %.1f) centre (%.1f %.1f %.1f)' % (
            bb.XMin, bb.YMin, bb.ZMin, bb.XMax, bb.YMax, bb.ZMax,
            bb.Center.x, bb.Center.y, bb.Center.z), flush=True)
print('  hits: %d' % hits, flush=True)
