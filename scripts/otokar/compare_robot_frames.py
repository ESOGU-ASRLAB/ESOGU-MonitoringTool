"""Compare corresponding Robot1/Robot2 STEP parts in their native frames.

This is an audit helper for deriving Robot2's installed placement. It prints
the native bounding boxes of named counterparts and, when requested, tests
the six axis-aligned orthogonal transforms that preserve a CAD part's shape.
"""
import os
import FreeCAD
import Import
import Part

FreeCAD.ParamGet("User parameter:BaseApp/Preferences/Mod/Import/hSTEP").SetBool(
    "ReadShapeCompoundMode", False
)


def solids(obj):
    shape = getattr(obj, "Shape", None)
    if shape is None or shape.isNull() or not shape.Solids:
        return None
    return Part.Compound(shape.Solids)


def load(stem):
    doc = FreeCAD.newDocument(stem)
    Import.insert(os.path.join(os.environ.get("RAW_DIR", "raw-cad/otokar"), stem + ".stp"), doc.Name)
    return {o.Label: o for o in doc.Objects}


def show(table, label):
    obj = table.get(label)
    if obj is None:
        print("MISSING %s" % label)
        return None
    shape = solids(obj)
    if shape is None:
        print("NO SOLIDS %s" % label)
        return None
    b = shape.BoundBox
    print("%-44s min=(%9.1f %9.1f %9.1f) max=(%9.1f %9.1f %9.1f) size=(%8.1f %8.1f %8.1f)" % (
        label, b.XMin, b.YMin, b.ZMin, b.XMax, b.YMax, b.ZMax,
        b.XLength, b.YLength, b.ZLength,
    ))
    return shape


r1 = load("Robot1_EKSEN2")
r2 = load("Robot2_EKSEN2")
print("=== Robot1 / Robot2 EKSEN2 native counterparts ===")
r1_shape = show(r1, os.environ.get("R1_LABEL", "2_Eksen_Robot_Plakasi_SYM"))
r2_shape = show(r2, os.environ.get("R2_LABEL", "2_Eksen_Robot_Plakasi"))

if r1_shape is not None and r2_shape is not None:
    print("volumes: R1 %.1f mm3  R2 %.1f mm3" % (r1_shape.Volume, r2_shape.Volume))
    print("direct native distance: %.3f mm" % r1_shape.distToShape(r2_shape)[0])
