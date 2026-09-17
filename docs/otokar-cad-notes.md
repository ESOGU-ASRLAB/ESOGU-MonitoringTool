# Otokar MATISSE cell — CAD provenance and verification notes

Working notes for the STEP → GLB conversion behind the Otokar MATISSE cell
in the facility scene. Written so the
next person does not have to re-derive any of it from the raw CAD.

**Source data is confidential.** The `.stp` files and the two source
presentations belong to Otokar and are not committed — see
[README](../README.md#otokar-matisse-cell-asset-sourcing).

## 1. What the source files actually contain

Thirteen STEP files, ~360 MB total, in `raw-cad/otokar/` (git-ignored):

| File | Parts (faces > 0) | Faces | Role |
|---|---|---|---|
| `Robot1_EKSEN1..5.stp` | 1134–3235 | 19.7k–138k | Robot 1, one file per axis assembly |
| `Robot2_EKSEN1..5.stp` | 1135–3277 | 20.3k–141k | Robot 2, same |
| `Robot{1,2}_Kamera.stp` | 1366 | 25.8k | Camera/sensor head |

| `16N37D-1__01092026.stp` | — | — | Bus body under inspection |

Read with FreeCAD 1.1's `Import` module (`freecadcmd`). Three properties of
these exports drive every decision in the conversion script:

**a) Units are millimetres, CAD is Z-up.** The converter multiplies by 0.001 so
the GLBs are in metres, which is what glTF expects and what removes the need
for a `scale={0.001}` prop of the kind the STL components elsewhere in this
project carry.

**b) Each file contains the assembly twice.** Alongside the machine as
installed there is a mirrored copy (the `_SYM`-suffixed instances) laid out
along the *other* horizontal axis. Loading a file at identity therefore renders
an L-shaped ghost: two perpendicular 16 m runs where the real cell has one.
`convert.py`'s `CROP` filter keeps the installed copy by part centroid:

- Robot 1's machine runs along CAD **X**, its rail sitting at Y ≈ +3160 mm → crop `|Y| < 6 m`
- Robot 2's machine runs along CAD **Y**, its rail sitting at X ≈ +135 mm → crop `|X| < 6 m`

**c) Only Robot 1's files are used.** Each robot's five axis files agree with
each other, but Robot 1's and Robot 2's frames differ by a mirror, and the
duplicate-crop in (b) does not resolve for Robot 2: its EKSEN2 still converts
to 0.82 x 15.76 x 6.51 m against Robot 1's 2.41 x 3.66 x 2.05 m for the same
part, because for Robot 2 the surviving duplicate lies along the very axis its
real machine runs on. Converted anyway, it lands 9.7 m outside the building.

Since the two are the same machine -- `Robot1_EKSEN5.stp` and
`Robot2_EKSEN5.stp` have identical face counts (20 173) and the rest match to
within a per-cent -- the scene draws both robots from the Robot 1 mesh set and
varies only their axis-1 value. `Robot2_EKSEN1..5` are not converted at all.

**d) The bus export carries jig geometry.** Its raw bounding box is 4.82 m
across and 4.50 m tall, against a real body of 2.50 m by 2.71 m: the extremes
are assembly fixtures, not the vehicle. The body's reference faces are
therefore taken as 0.5 % / 99.5 % percentiles of the vertex cloud, which land
on the body itself and cross-check against the root part `16N37D-1__01092026`
(11.86 m long, ±1251 mm half width).

**e) The camera head is in its own local frame.** `Robot2_Kamera.stp` has it
centred on the origin (300 × 297 × 124 mm). `Robot1_Kamera.stp` holds identical
hardware placed 3.9 m off in X with no relation to that robot's own axis-5
flange. Both robots therefore share the origin-centred mesh
(`meshes/otokar/shared/`), mounted by transform.

## 2. Verification against the presentation figures

The project rule is source data over guesswork, so the axis table from
`MATISSE_Rokos_Yörünge_Bilgileri.pptx` was cross-checked against the geometry.

| Claim (PPTX) | Geometric check | Result |
|---|---|---|
| Axis 1 travel 16 000 mm | `Robot2_EKSEN1` X extent | **16 000.0 mm exactly — confirmed** |
| Axis 4 and 5 are rotary | Part labels `4_Eksen_Reduktor_Baglanti_Braketi`, `5_Eksen_Reduktor_Baglanti_Braketi`, 36 × `NABTESCO_EREF` cycloidal reducer parts in each | **Confirmed** |
| Axes 1–3 are linear | INA/FAG `KWVE45`, `KWVE35`, `KWVE25` linear guide carriages in `EKSEN1/2/3` respectively, plus `Kettenglied` energy-chain links | **Confirmed** |
| Axis 2 travel 3 350 mm | `EKSEN2` column Z envelope is 5 295 mm | Consistent, not independently confirmed |
| Axis 3 travel 1 800 mm | `EKSEN3` arm X envelope is 4 388 mm | Consistent, not independently confirmed |

### Discrepancy worth flagging

The PPTX names the axes **Z / Y / X / AX / AZ**, with axis 1 ("Z") as the long
rail. In the CAD the long 16 m rail runs along **X**, and the vertical column
along **Z**. So the presentation's letters are *controller* axis names, not CAD
frame axes, and the two do not line up. The code keeps the PPTX numbering
(axis 1…5) as the interface and documents the CAD direction each one drives;
it deliberately does not use the letters.

**Still unverified:** that PPTX slide order maps to CAD file number for axes 2
and 3 (axes 4 and 5 are confirmed by part name). The travels in the table are
applied on that assumption and marked as such in `OtokarGantryRobot.js`.

### The cell is two portals on one runway

Reading `EKSEN1`'s structural members part by part settles the cell layout,
which bounding boxes alone had made ambiguous:

| Part | CAD Y | What it is |
|---|---|---|
| `Konstruksiyon_modul` 1–4 | 2757.4 … 3563.9 | Floor rail, four 4 m modules tiling X −12 636 … +3 383 |
| `2_Eksen_Sabit_SYM` | 2817.5 … 3530.6 | Column, Z −839 … +3 588 |
| `2_Konstruksiyon_SYM` | −3305.8 … −2855.8 | Column, Z −812 … +3 368 |

Columns on **both** sides of the opening: each robot is a complete portal, not
a single-sided rail. The body passes through it, so the measured 1 643.6612 mm
side clearance is applied **once**, inward from the rail face, putting the body
centreline at CAD Y ≈ −137 mm and leaving 1 467 mm to the far column.

That also explains the deck's note that "Robot 2's X values are defined
relative to Robot 1's zero": the two portals share one runway and one
reference, and differ only in where they sit along it. An earlier version of
this scene instead put the two robots 11.3 m apart on opposite sides of the
body, which counted the same clearance twice, made the cell 18.4 m wide
instead of 7.5 m, and left both arms facing away from the body.

### Placing the cell in the facility

The warehouse shell (`Factory.js`) measures **x −16.39 … +16.39**, **z −24.73
… +24.73**, ridge at 10.17 m, lowest roof beams at 5.31 m. Those bounds were
read off the glTF with `scripts/otokar/glb_bbox.mjs`; an earlier version of
this cell was placed by eye at x = −20 and sat 3.6 m outside the west wall,
because a comment elsewhere describing the building's corners as "~30 m out"
is the *diagonal*, not the half width.

`scripts/otokar/verify_cell_fit.mjs` replays the scene's whole transform chain
over the converted bounding boxes and reports the margins. Run it after
changing any placement constant:

```
node scripts/otokar/verify_cell_fit.mjs
```

It is what caught Robot 2's meshes landing outside the shell — a screenshot
did not show it. Current margins: 4.88 m to the west wall, 2.15 m to the near
end wall, 0.44 m under the roof beams. Geometry below y = 0 is expected: the
rail's Fischer M16x380 anchor studs sit in the slab and the axis-2 energy
chain runs in a floor trench.

### Datum faces used to place the bus

The deck's three body clearances are all measured *from the rail*, so the
rail-side half of each is read out of the CAD (`scripts/otokar/query_part.py`)
rather than retyped. These are in `otokarCellGeometry.js`:

| Datum | Value | How it was read |
|---|---|---|
| Rail inner side face | Y = 2757.4 mm | The four `Konstruksiyon_modul` rail modules span Y 2757.4 – 3563.9, so an 806.5 mm beam on a 3160.65 mm centreline |
| Rail rear end | X = −12 724.986 mm | The axis-1 mesh's −X extreme |
| Rail foot top face / floor | Z = −1368.0 mm | The `Yere_Baglanti_Set` floor fixings span Z −1748.0 – −1368.0, and that 380 mm is exactly the `Fischer_M16x380_Saplama` anchor stud length — so the studs are the embedded part and −1368 is the concrete surface |

Taking −1368 as both the foot's top face and floor level puts the body
underside **1646.2 mm above the floor**, i.e. the deck's figure measured
straight up from the slab. That is consistent with the cell's stated scanning
regions, which include the underbody — the body is up on the line carrier, not
on its wheels. Reading the floor as −1748 instead would leave the underside
2.03 m up and the anchor studs standing proud of the slab, which is why −1368
is used.

## 2.5 Completeness audit: are the cable carriers actually there?

Prompted by a reasonable-looking hypothesis -- that the energy-chain/cable
carrier parts, visually prominent in Otokar's own reference photos, had been
silently dropped by the fastener-name filter alongside real fasteners.
Checked directly rather than assumed:

- `Robot1_EKSEN1.stp` has 107 parts named `_Kettenglied 0524-182-*` ("chain
  link" in German). `kettenglied` WAS in `DROP_NAME_RE`, lumped in with bolts
  and pins. But every one of those 107 instances sits at Y 6556-14878mm --
  entirely outside the +/-6000mm crop band that separates the installed copy
  from the mirrored duplicate (section 1b). None of them were ever kept
  regardless of the name filter, so removing "kettenglied" from the regex is
  a correctness fix (a chain link is not a fastener) but not a fix for a
  missing chain -- there wasn't one to lose here.
- Axis 1's REAL, installed cable carrier is modelled under different names --
  `Kablo_Traktoru` and `Kablo_Tavasi_Komple` -- centred at Y ~3050-3274mm
  (inside the crop band, alongside the rail modules at Y 2757-3564mm) and
  ~16 m long in X, i.e. it runs the full rail. Neither name matches any term
  in `DROP_NAME_RE`, and at that size it clears both LOD tiers' size floors by
  a wide margin, so it was already being kept before this check.
- Axis 2's `2_Eksen_Kablo_Traktoru` and axis 3's 34 `C_Profil_Kablo_Arabasi`
  segments were checked the same way: present, in-crop, unfiltered by name.
  The EKSEN3 segments (~47mm diagonal) clear the `hi` tier's 25mm floor but
  not the `lo` tier's 80mm one, which is the intended LOD behaviour, not a bug
  -- individual profile links aren't worth keeping at the 16m-overview tier.

Rendering `robot1/hi/axis1.glb` in isolation (top and side) confirms the
carrier geometry is present, but it isn't visually distinct: it sits inside
the rail module's own Z-envelope (Z -1052..-947mm, inside the rail's
-1501..-853mm) and shares that part's single flat grey material, so from
outside it reads as part of the rail's bulk rather than as its own
recognisable feature. If it needs to read as a cable carrier rather than just
being present, that's a material/highlight-colour change, not a geometry one.

## 3. Conversion pipeline

`scripts/otokar/build_otokar_meshes.sh` — needs FreeCAD 1.1 and npx on PATH.

```
STEP ──FreeCAD Import──> filter ──tessellate──> GLB ──gltf-transform──> GLB
                            │                          weld
                            ├─ drop datum planes/axes   simplify (meshoptimizer)
                            ├─ drop fasteners by name   draco
                            ├─ drop parts under the LOD size floor
                            └─ crop to the installed copy (see 1b)
```

Two LOD tiers per part:

| Tier | Deflection | Min part | Simplify | Used for |
|---|---|---|---|---|
| `hi` | 6 mm | 25 mm | ratio 0.40, error 0.002 | camera within ~18 m |
| `lo` | 20 mm | 80 mm | ratio 0.12, error 0.012 | the full 16 m overview |

The GLBs carry **POSITION and indices only, no normals** — these are machined
parts and smoothed normals melt every milled edge, so the viewer shades them
flat instead. That also drops roughly a third of the file size.

Draco decoding uses a **self-hosted** decoder in `client/public/draco/`, copied
from the `three` package, rather than the gstatic CDN — same offline-shop-floor
reasoning as the `RoomEnvironment` choice in `Scene.js`.

## 4. Re-running the conversion

```bash
bash scripts/otokar/build_otokar_meshes.sh                 # everything
bash scripts/otokar/build_otokar_meshes.sh Robot1_EKSEN3   # one part
```

Paths at the top of the script assume the repo layout; `raw-cad/otokar/` must
be populated first.
