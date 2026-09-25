"""Print internal Name vs Label, and the full local/global Placement matrix, for
named sub-assemblies of a STEP file.

Two things this answers:
  1. Whether convert.py's role_of()/root checks -- which compare obj.Name
     against product names like "_1_Eksen_Hareketli_SYM" -- can match at all
     under the current import mode, or whether they must use obj.Label.
  2. The real assembly placement (rotation + translation) that FreeCAD bakes
     into a subassembly's own Shape but NOT into its child Part::Features,
     which is the transform the per-axis STEP exports are suspected of having
     been flattened against.

  STP_IN   source .stp
  LABELS   comma-separated object labels (default: the EKSEN1 chain)
"""
import os
import sys
import FreeCAD
import Import
import Part

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
FreeCAD.ParamGet(
    "User parameter:BaseApp/Preferences/Mod/Import/hSTEP"
).SetBool("ReadShapeCompoundMode", False)

src = os.environ['STP_IN']
labels = os.environ.get(
    'LABELS',
    '1_Eksen_SYM,1_Eksen_Hareketli_SYM,2_Eksen_Sabit_SYM,2_Konstruksiyon_SYM'
).split(',')

doc = FreeCAD.newDocument('probe')
Import.insert(src, doc.Name)


def ancestors(obj):
    """convert.py's own ancestor walk, reproduced verbatim."""
    stack = list(obj.InList)
    seen = set()
    while stack:
        parent = stack.pop()
        if parent.Name in seen:
            continue
        seen.add(parent.Name)
        yield parent
        stack.extend(parent.InList)


def role_of_by_name(obj):
    """convert.py's current predicate, which keys off internal Name."""
    names = {obj.Name} | {p.Name for p in ancestors(obj)}
    return "carriage" if "_1_Eksen_Hareketli_SYM" in names else "runway"


def role_of_by_label(obj):
    labels_ = {obj.Label} | {p.Label for p in ancestors(obj)}
    return "carriage" if "1_Eksen_Hareketli_SYM" in labels_ else "runway"


def show_matrix(tag, m):
    print('    %s' % tag)
    for row in (
        (m.A11, m.A12, m.A13, m.A14),
        (m.A21, m.A22, m.A23, m.A24),
        (m.A31, m.A32, m.A33, m.A34),
        (m.A41, m.A42, m.A43, m.A44),
    ):
        print('      [%10.6f %10.6f %10.6f %12.3f ]' % row)


def interesting(obj):
    """LABELS=* selects every object carrying a non-identity placement."""
    if labels != ['*']:
        return obj.Label in labels
    pl = obj.Placement
    moved = pl.Base.Length > 1e-6 or pl.Rotation.Angle > 1e-9
    return moved and getattr(obj, 'Shape', None) is not None


for o in doc.Objects:
    if not interesting(o):
        continue
    print('=== %s ===' % o.Label, flush=True)
    print('  internal Name : %s   (TypeId %s)' % (o.Name, o.TypeId))
    print('  parents       : %s' % ' > '.join(
        '%s[%s]' % (p.Label, p.Name) for p in ancestors(o)))
    print('  role_of by Name  -> %s' % role_of_by_name(o))
    print('  role_of by Label -> %s' % role_of_by_label(o))

    pl = o.Placement
    rot = pl.Rotation
    print('  local Placement : pos (%.3f, %.3f, %.3f)' % (
        pl.Base.x, pl.Base.y, pl.Base.z))
    print('                    axis (%.6f, %.6f, %.6f) angle %.4f deg' % (
        rot.Axis.x, rot.Axis.y, rot.Axis.z, rot.Angle * 180.0 / 3.141592653589793))
    print('                    yaw/pitch/roll %s' % (rot.toEuler(),))
    show_matrix('local Placement matrix:', pl.Matrix)

    try:
        gp = o.getGlobalPlacement()
        grot = gp.Rotation
        print('  GLOBAL Placement: pos (%.3f, %.3f, %.3f)' % (
            gp.Base.x, gp.Base.y, gp.Base.z))
        print('                    axis (%.6f, %.6f, %.6f) angle %.4f deg' % (
            grot.Axis.x, grot.Axis.y, grot.Axis.z,
            grot.Angle * 180.0 / 3.141592653589793))
        show_matrix('GLOBAL Placement matrix:', gp.Matrix)
    except Exception as exc:
        print('  GLOBAL Placement: unavailable (%s)' % exc)

    s = getattr(o, 'Shape', None)
    if s is not None and not s.isNull() and s.Solids:
        bb = Part.Compound(s.Solids).BoundBox
        print('  shape bbox      : (%.1f %.1f %.1f)..(%.1f %.1f %.1f) centre (%.1f %.1f %.1f)' % (
            bb.XMin, bb.YMin, bb.ZMin, bb.XMax, bb.YMax, bb.ZMax,
            bb.Center.x, bb.Center.y, bb.Center.z))
        sp = s.Placement
        print('  shape Placement : pos (%.3f, %.3f, %.3f) angle %.4f deg' % (
            sp.Base.x, sp.Base.y, sp.Base.z,
            sp.Rotation.Angle * 180.0 / 3.141592653589793))
    print(flush=True)
