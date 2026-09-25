"""Where do the axis-2 cable chain's solids ACTUALLY sit?

The chain was excluded from the axis2 mesh because its bounding box reached
cell Z -1866 -- 498 mm below the factory floor -- and dragged the column
through the floor rail at every low column height. Otokar's own render shows it
running UP the column with a U-bend at the top, which is nothing like that, so
the box and the hardware disagree.

The suspect is the same one the bus body had: the chain's children include
unplaced master copies parked far outside the assembly (one sits at Y 15418,
fifteen metres away), and a box drawn round the group takes them in. If the
chain's own placed solids are fine and only the ghosts are wrong, the fix is to
drop the ghosts and keep the chain, not to drop the chain.

This reports the chain's solids by height, and separately anything of its that
sits outside the machine's own envelope.

  "/c/Program Files/FreeCAD 1.1/bin/freecadcmd.exe" scripts/otokar/inspect_axis2_chain.py
"""
import os
import FreeCAD, Import, Part

FreeCAD.ParamGet('User parameter:BaseApp/Preferences/Mod/Import/hSTEP').SetBool('ReadShapeCompoundMode', False)

root = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
src = os.environ.get('STP_IN', os.path.join(root, 'raw-cad/otokar/Robot1_EKSEN2.stp'))

doc = FreeCAD.newDocument('e2chain')
Import.insert(src, doc.Name)

chain = next(o for o in doc.Objects if o.Label == '2_Eksen_Kablo_Traktoru')
solids = chain.Shape.Solids
bb = Part.Compound(solids).BoundBox
print('%s: %d solids  X[%.0f, %.0f]  Y[%.0f, %.0f]  Z[%.0f, %.0f]'
      % (chain.Label, len(solids), bb.XMin, bb.XMax, bb.YMin, bb.YMax, bb.ZMin, bb.ZMax), flush=True)

# The rest of EKSEN2, for an envelope to judge "outside" against.
top = next(o for o in doc.Objects if not o.InList)
others = [s for s in top.Shape.Solids]
print('root %s: %d solids' % (top.Label, len(others)), flush=True)

print('\nchain solids by height (50 mm bands):')
bands = {}
for s in solids:
    c = s.BoundBox.Center
    k = int(c.z // 50)
    b = bands.setdefault(k, {'n': 0, 'ymin': 1e9, 'ymax': -1e9, 'xmin': 1e9, 'xmax': -1e9})
    b['n'] += 1
    b['ymin'] = min(b['ymin'], c.y); b['ymax'] = max(b['ymax'], c.y)
    b['xmin'] = min(b['xmin'], c.x); b['xmax'] = max(b['xmax'], c.x)
for k in sorted(bands):
    b = bands[k]
    print('  Z %+7.0f..%+7.0f  solids=%4d  X %8.0f..%8.0f  Y %9.0f..%9.0f'
          % (k * 50, k * 50 + 50, b['n'], b['xmin'], b['xmax'], b['ymin'], b['ymax']), flush=True)

# The machine sits around X 1263..2060, Y -3529..-2747 in this frame. Anything
# far outside that is a master copy, not installed hardware.
print('\nchain solids OUTSIDE the machine envelope (X 1200..2100, Y -3600..-2700):')
stray = 0
for i, s in enumerate(solids):
    c = s.BoundBox.Center
    if 1200 <= c.x <= 2100 and -3600 <= c.y <= -2700:
        continue
    stray += 1
    if stray <= 12:
        b = s.BoundBox
        print('  solid %3d  X[%8.0f,%8.0f] Y[%9.0f,%9.0f] Z[%8.0f,%8.0f]'
              % (i, b.XMin, b.XMax, b.YMin, b.YMax, b.ZMin, b.ZMax), flush=True)
print('  total outside: %d of %d' % (stray, len(solids)), flush=True)

inside = [s for s in solids
          if 1200 <= s.BoundBox.Center.x <= 2100 and -3600 <= s.BoundBox.Center.y <= -2700]
if inside:
    ib = Part.Compound(inside).BoundBox
    print('\nchain WITHOUT the strays: %d solids  X[%.0f, %.0f]  Y[%.0f, %.0f]  Z[%.0f, %.0f]'
          % (len(inside), ib.XMin, ib.XMax, ib.YMin, ib.YMax, ib.ZMin, ib.ZMax), flush=True)
