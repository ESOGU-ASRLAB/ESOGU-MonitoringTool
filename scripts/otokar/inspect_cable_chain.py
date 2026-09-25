"""What shape is the axis-1 energy chain, link by link?

`Kablo_Traktoru` is the 8.5 m chain lying in the 16 m cable tray along the
axis-1 rail. It currently never moves, because convert.py files it into the
static runway mesh -- it is a sibling of the moving branch, not a child of it,
and the runway/carriage split is a name test.

Moving it wholesale with the carriage would be worse than leaving it still: it
is half the rail's length, so a rigid 15.2 m sweep would push it metres past the
end of the rail. A real energy chain has an anchored run, a rolling U-bend and a
towed run, and the bend travels half what the carriage does.

To drive it that way the links have to be separable. This reports how the
chain's solids are laid out -- their X positions and heights -- so the split
into anchored run, bend and towed run can be made from the geometry instead of
guessed.

  "/c/Program Files/FreeCAD 1.1/bin/freecadcmd.exe" scripts/otokar/inspect_cable_chain.py
"""
import os
import FreeCAD, Import, Part

root = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
src = os.environ.get('STP_IN', os.path.join(root, 'raw-cad/otokar/Robot1_EKSEN1.stp'))

doc = FreeCAD.newDocument('chain')
Import.insert(src, doc.Name)

target = next(o for o in doc.Objects if o.Label.startswith('Kablo_Traktoru'))
shape = Part.Compound(target.Shape.Solids)
bb = shape.BoundBox
print('%s: %d solids  X[%.0f, %.0f]  Y[%.0f, %.0f]  Z[%.0f, %.0f]'
      % (target.Label, len(target.Shape.Solids), bb.XMin, bb.XMax, bb.YMin, bb.YMax, bb.ZMin, bb.ZMax),
      flush=True)

# The two runs are stacked, so height separates them. Histogram the links by the
# Z of their centre to find where the split sits and how many links are in each.
zmid = (bb.ZMin + bb.ZMax) / 2
buckets = {}
for s in target.Shape.Solids:
    c = s.BoundBox.Center
    k = int((c.z - bb.ZMin) // 20)
    b = buckets.setdefault(k, {'n': 0, 'xmin': 1e9, 'xmax': -1e9})
    b['n'] += 1
    b['xmin'] = min(b['xmin'], c.x)
    b['xmax'] = max(b['xmax'], c.x)
print('\nlinks by height (20 mm bands, Z measured from the chain\'s own floor):')
for k in sorted(buckets):
    b = buckets[k]
    print('  Z %+6.0f..%+6.0f  links %4d   centre X from %9.0f to %9.0f'
          % (bb.ZMin + k * 20, bb.ZMin + k * 20 + 20, b['n'], b['xmin'], b['xmax']), flush=True)

lower = [s for s in target.Shape.Solids if s.BoundBox.Center.z < zmid]
upper = [s for s in target.Shape.Solids if s.BoundBox.Center.z >= zmid]
for name, group in (('LOWER run', lower), ('UPPER run', upper)):
    if not group:
        continue
    gb = Part.Compound(group).BoundBox
    print('\n%s: %d links  X[%.0f, %.0f]  Z[%.0f, %.0f]'
          % (name, len(group), gb.XMin, gb.XMax, gb.ZMin, gb.ZMax), flush=True)

# Where the U-bend is: the extreme of the run that does NOT reach the carriage.
xs_lower = sorted(s.BoundBox.Center.x for s in lower)
xs_upper = sorted(s.BoundBox.Center.x for s in upper)
if xs_lower and xs_upper:
    print('\nlower run centres span %.0f .. %.0f' % (xs_lower[0], xs_lower[-1]))
    print('upper run centres span %.0f .. %.0f' % (xs_upper[0], xs_upper[-1]))
