"""Which solids does each EKSEN3 file offer for the three telescopic stages?

Robot 2's arm sits X-mirrored against robot 1's while the rest of the machine
is a clean mirror about the bus centre plane, and the first suspect was
export_telescopic.py's

    next(o for o in doc.Objects if o.Label.startswith(prefix))

picking a different instance in each file -- robot 1's stages are labelled
`Ic_Konstruksiyon_SYM_rev2` and robot 2's `Ic_Konstruksiyon_rev2`, and both
start with the prefix. THAT TURNED OUT TO BE WRONG: this reports exactly one
candidate per prefix in each file, so there is nothing to pick between and the
two labels are simply what each export calls its only copy.

What this did establish is the real relationship. Robot 2's stage solids are
robot 1's TRANSLATED -- (-14121.0, +6424.2, +3410.0) in X, Y and Z, identical at
both ends of every stage's bbox -- and not mirrored at all. So the mirror has to
come from the placement matrix, and robot 2's does not supply it: it leaves X
un-flipped where robot 1's flips it. See export_telescopic.py, which now derives
robot 2's matrix from robot 1's rather than carrying its own.

  STP_DIR=raw-cad/otokar "/c/Program Files/FreeCAD 1.1/bin/freecadcmd.exe" \
  scripts/otokar/inspect_eksen3_stages.py
"""
import os
import FreeCAD, Import, Part

FreeCAD.ParamGet('User parameter:BaseApp/Preferences/Mod/Import/hSTEP').SetBool('ReadShapeCompoundMode', False)

root = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
src_dir = os.environ.get('STP_DIR', os.path.join(root, 'raw-cad/otokar'))
PREFIXES = ['Ic_Konstruksiyon', 'Orta_Konstruksiyon', 'Dis_Konstruksiyon']

for stem in ['Robot1_EKSEN3', 'Robot2_EKSEN3']:
    doc = FreeCAD.newDocument(stem)
    Import.insert(os.path.join(src_dir, stem + '.stp'), doc.Name)
    print('\n===== %s  (%d objects)' % (stem, len(doc.Objects)), flush=True)
    for prefix in PREFIXES:
        hits = [o for o in doc.Objects if o.Label.startswith(prefix)]
        print('  %s -> %d candidate(s)%s'
              % (prefix, len(hits), '   [export_telescopic.py takes the first]' if hits else ''))
        for i, o in enumerate(hits):
            shape = getattr(o, 'Shape', None)
            if shape is None or shape.isNull() or not shape.Solids:
                print('      %d %-34s (no solids)' % (i, o.Label))
                continue
            bb = Part.Compound(shape.Solids).BoundBox
            print('      %d %-34s solids=%4d  X[%9.1f, %9.1f]  Y[%9.1f, %9.1f]  Z[%9.1f, %9.1f]'
                  % (i, o.Label, len(shape.Solids),
                     bb.XMin, bb.XMax, bb.YMin, bb.YMax, bb.ZMin, bb.ZMax), flush=True)
    FreeCAD.closeDocument(doc.Name)
