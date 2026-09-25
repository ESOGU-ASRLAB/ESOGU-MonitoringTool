"""Print the installed EKSEN1 STEP assembly's first-level CAD subassemblies.

Run with freecadcmd and STP_IN=Robot1_EKSEN1.stp. The hierarchy matters because
EKSEN1 contains both the fixed 16 m runway and a moving portal carriage.
"""
import os
from collections import Counter, defaultdict
import FreeCAD, Import, Part

doc = FreeCAD.newDocument('axis1_structure')
Import.insert(os.environ['STP_IN'], doc.Name)

def lineage(obj):
    result = []
    seen = set()
    while obj.InList:
        parent = obj.InList[0]
        if parent.Name in seen:
            break
        seen.add(parent.Name)
        result.append(parent)
        obj = parent
    return result

branches = Counter()
samples = defaultdict(list)
focus = {'_1_Eksen_SYM', '_1_Eksen_Hareketli_SYM', '_2_Eksen_Sabit_SYM',
         'Kablo_Tavasi_Komple', 'Kablo_Traktoru', 'Konstruksiyon_modul',
         'Konstruksiyon_modul2', 'Konstruksiyon_modul3', 'Konstruksiyon_modul4'}
for obj in doc.Objects:
    shape = getattr(obj, 'Shape', None)
    if shape is None or shape.isNull() or not shape.Solids:
        continue
    box = shape.BoundBox
    if not -6000 <= box.Center.y <= 6000:
        continue
    if obj.Name in focus:
        print('FOCUS %-33s solids=%4d faces=%6d bbox=(%.0f %.0f %.0f)..(%.0f %.0f %.0f) parents=%s' % (
            obj.Name, len(shape.Solids), len(shape.Faces),
            box.XMin, box.YMin, box.ZMin, box.XMax, box.YMax, box.ZMax,
            [parent.Name for parent in obj.InList]), flush=True)
        if obj.Name in ('_1_Eksen_Hareketli_SYM', '_1_Eksen_SYM'):
            solid_box = Part.Compound(shape.Solids).BoundBox
            print('  SOLIDS ONLY bbox=(%.0f %.0f %.0f)..(%.0f %.0f %.0f)' % (
                solid_box.XMin, solid_box.YMin, solid_box.ZMin,
                solid_box.XMax, solid_box.YMax, solid_box.ZMax), flush=True)
    chain = lineage(obj)
    names = [obj.Name] + [p.Name for p in chain]
    if '_1_Eksen_SYM' not in names:
        continue
    index = names.index('_1_Eksen_SYM')
    branch = names[index - 1] if index > 0 else '<root>'
    if branch.startswith('Part__Feature'):
        branch = '<loose parts>'
    branches[branch] += 1
    if len(samples[branch]) < 8:
        samples[branch].append((obj.Label, round(box.Center.x), round(box.Center.y), round(box.Center.z)))

for branch, count in branches.most_common(15):
    print('%5d %-50s samples=%s' % (count, branch, samples[branch][:2]), flush=True)
