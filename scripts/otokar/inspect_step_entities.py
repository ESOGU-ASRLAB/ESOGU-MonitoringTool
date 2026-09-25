"""List non-solid STEP objects that may carry mechanical datum references."""
import os
import FreeCAD, Import

path = os.environ['STP_IN']
doc = FreeCAD.newDocument('entities')
Import.insert(path, doc.Name)
for obj in doc.Objects:
    shape = getattr(obj, 'Shape', None)
    if shape is not None and not shape.isNull() and getattr(shape, 'Faces', None):
        continue
    label = getattr(obj, 'Label', '')
    props = []
    for prop in getattr(obj, 'PropertiesList', []):
        if prop.lower() in ('placement', 'label', 'shape', 'visibility'):
            continue
        try:
            props.append('%s=%s' % (prop, getattr(obj, prop)))
        except Exception:
            pass
    placement = getattr(obj, 'Placement', None)
    if placement is not None:
        try:
            base = placement.Base
            angle = placement.Rotation.Angle
            axis = placement.Rotation.Axis
            props.append('PlacementBase=(%.3f, %.3f, %.3f)' % (base.x, base.y, base.z))
            props.append('Rotation=(%.3f around %.3f, %.3f, %.3f)' % (angle, axis.x, axis.y, axis.z))
        except Exception:
            pass
    print('%s | %s | %s' % (obj.Name, label, '; '.join(props)))
FreeCAD.closeDocument(doc.Name)
