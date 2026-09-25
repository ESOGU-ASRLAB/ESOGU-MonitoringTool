"""Re-export the bus root once. Preserve excluded solids as collision obstacles.

Remote solids outside the vehicle envelope are quarantined, not repositioned
or deleted from the STEP source. The full collision asset includes them.
"""
import os, sys, json
import FreeCAD, Import, Part
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from glbwrite import write_glb
root = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
FreeCAD.ParamGet('User parameter:BaseApp/Preferences/Mod/Import/hSTEP').SetBool('ReadShapeCompoundMode', False)
doc = FreeCAD.newDocument('bus')
Import.insert(os.path.join(root,'raw-cad/otokar/16N37D-1__01092026.stp'),doc.Name)
obj = next(o for o in doc.Objects if o.Label == '16N37D-1__01092026')
solids = obj.Shape.Solids
kept, excluded = [], []
for i, s in enumerate(solids):
    b = s.BoundBox
    # Entire solid beyond the conservative vehicle envelope: no cutting of
    # triangles or shrinkage of structural members at the envelope boundary.
    outside = b.YMin > 1280 or b.YMax < -1280 or b.ZMax < 120 or b.ZMin > 3020
    (excluded if outside else kept).append((i,s))
manifest = {'source':'16N37D-1__01092026.stp', 'kept':len(kept),
            'quarantined':[{'solid':i,'bbox':[s.BoundBox.XMin,s.BoundBox.YMin,s.BoundBox.ZMin,s.BoundBox.XMax,s.BoundBox.YMax,s.BoundBox.ZMax]} for i,s in excluded],
            'note':'Quarantined out-of-envelope solids retained in collision.glb; mounting/fixture status unknown.'}
for name, selection, deflection in [('hi/body',kept,6),('lo/body',kept,20),('collision',list(enumerate(solids)),1)]:
    verts, indices = [], []
    for i,s in selection:
        pts, faces=s.tessellate(deflection)
        base=len(verts)//3
        verts.extend(v*.001 for p in pts for v in (p.x,p.y,p.z))
        indices.extend(base+j for f in faces for j in f)
    path=os.path.join(root,'client/public/meshes/otokar/bus',name+'.glb')
    write_glb(path,verts,indices)
    print('EXPORTED',name,len(indices)//3,flush=True)
with open(os.path.join(root,'client/public/meshes/otokar/bus/geometry-audit.json'),'w') as f:
    json.dump(manifest,f,indent=2)
print('QUARANTINED',len(excluded),flush=True)
