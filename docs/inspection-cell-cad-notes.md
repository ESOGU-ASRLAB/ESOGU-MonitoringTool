# MATISSE cell — CAD provenance and verification notes

Working notes for the STEP → GLB conversion behind the MATISSE cell
in the facility scene. Written so the
next person does not have to re-derive any of it from the raw CAD.

**Source data is confidential.** The `.stp` files and the two source
presentations belong to the industrial partner and are not committed — see
[README](../README.md#inspection-cell-asset-sourcing).

## 1. What the source files actually contain

Thirteen STEP files, ~360 MB total, in the confidential CAD directory under `raw-cad/` (git-ignored):

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
installed there is a second copy of the same geometry laid out along the
*other* horizontal axis. Loading a file at identity therefore renders an
L-shaped ghost: two perpendicular 16 m runs where the real cell has one.
`convert.py`'s `CROP` filter keeps the installed copy by part centroid:

> **Correction (2026-09-23).** An earlier version of this note called the
> duplicate "the `_SYM`-suffixed instances". That is wrong twice over, and it
> cost real time downstream. `_SYM` is not a marker for the duplicate — it is
> ubiquitous in these exports and appears on installed parts
> (`1_Eksen_Hareketli_SYM` is the real carriage). And the duplicate is not a
> separate modelled copy at all: it is the **master/placed split** that
> FreeCAD's STEP import produces. A subassembly's own `Shape` has its assembly
> placement baked in, while its child `Part::Feature` objects keep the
> unplaced master coordinates. So the same part is reachable at two different
> locations — placed and unplaced — and only the placed one is real. See
> section 2.7 for how that split turned out to BE the missing "cross-file
> correction".

- Robot 1's machine runs along CAD **X**, its rail sitting at Y ≈ +3160 mm → crop `|Y| < 6 m`
- Robot 2's machine runs along CAD **Y**, its rail sitting at X ≈ +135 mm → crop `|X| < 6 m`

**c) Robot 2 is a mirrored, independently converted machine.** Robot 1's and
Robot 2's exports use different native orientations and roots. Robot2_EKSEN1
is converted with its native-Y rail rotated into the shared installed frame.

Robot2_EKSEN1 is converted with its native-Y rail rotated into the shared
installed frame. Robot2_EKSEN2..5 use explicit matrices in
`placements.json`, derived from matching Robot1 envelopes and
the customer end-view mirror plane. All Robot2 outputs now ship through the
same STEP → GLB pipeline; the runtime renders Robot2's own rail and complete
chain rather than reusing Robot1 geometry or hiding a sibling rail.

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
(`meshes/bus-inspection/shared/`), mounted by transform.

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
applied on that assumption and marked as such in the gantry renderer.

### RETRACTED: "the cell is two portals on one runway"

**This section previously claimed each robot is a two-legged portal straddling
the body, with both robots riding one shared runway. That is wrong, and the
scene is still built on it. Confirmed against the industrial partner's slides
(2026-09-23): the cell is TWO INDEPENDENT PARALLEL RAILS, one per robot. Each
robot is a SINGLE-COLUMN gantry on its own rail. The two robots are mirror
images with their arms pointing INWARD, and the bus sits between the rails.**

The retracted claim rested on this table, and specifically on reading
`2_Konstruksiyon_SYM` as a second, far-side leg:

| Part | CAD Y | What it was read as |
|---|---|---|
| `Konstruksiyon_modul` 1–4 | 2757.4 … 3563.9 | Floor rail, four 4 m modules tiling X −12 636 … +3 383 |
| `2_Eksen_Sabit_SYM` | 2817.5 … 3530.6 | Column, Z −839 … +3 588 |
| `2_Konstruksiyon_SYM` | −3305.8 … −2855.8 | "second column", Z −812 … +3 368 |

`2_Konstruksiyon_SYM` is **not a second leg. It is not a structure at all.** It
is the unplaced master copy of `2_Eksen_Sabit_SYM`'s own column — the
master/placed split described in section 1(b). The evidence, from
`extract_part.py`:

- it is listed as a *child of* `2_Eksen_Sabit_SYM`;
- its seven children (`Profil_150x150x4150`, `2_Eksen_Taban_Plaka_SYM`,
  `2_Eksen_Kremayer_Baglanti_Plakasi_SYM`, the caps and gussets) are at
  **coordinates identical to** `2_Eksen_Sabit_SYM`'s own children, to the
  0.1 mm;
- rendered alone it is one 150 × 150 mm mast, 4150 mm tall, on a 450 × 450 mm
  base plate, with a bottom gusset and a full-height rack strip — i.e. exactly
  the same column, not a different one.

Two columns were never there. One column, one rail, one robot.

**Dependent values corrected after the retraction:**

- `BODY_CENTRELINE_IN_ROBOT_MM` places the bus between the two rail reference
  faces; `clearance_table.mjs` measures all three deck clearances at 0.00 mm
  delta on both sides.
- The inspection cell's default poses now park both independent carriages at
  a1 = 0 and render both rails plus each robot's complete converted chain.
- The deck's "Robot 2's X values are defined relative to Robot 1's zero" means
  the two robots share **one world datum**, not one rail.

### Placing the cell in the facility

The warehouse shell (`Factory.js`) measures **x −16.39 … +16.39**, **z −24.73
… +24.73**, ridge at 10.17 m, lowest roof beams at 5.31 m. Those bounds were
read off the glTF with `glb_bbox.mjs`; an earlier version of
this cell was placed by eye at x = −20 and sat 3.6 m outside the west wall,
because a comment elsewhere describing the building's corners as "~30 m out"
is the *diagonal*, not the half width.

The layout check replays the scene's whole transform chain
over the converted bounding boxes and reports the margins. Run it after
changing any placement constant:

```
npm --prefix client run inspection:check-layout
```

It is what caught Robot 2's meshes landing outside the shell — a screenshot
did not show it. The current full hi-res union has 7.80 m to the west wall and
13.29 m to the near end wall, with 0.44 m under the conservative roof beam
limit. Geometry below y = 0 is expected: the
rail's Fischer M16x380 anchor studs sit in the slab and the axis-2 energy
chain runs in a floor trench.

### Datum faces used to place the bus

The deck's three body clearances are all measured *from the rail*, so the
rail-side half of each is read out of the CAD (`query_part.py`)
rather than retyped. These values are used by the inspection cell geometry:

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
carrier parts, visually prominent in the industrial partner's reference photos, had been
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

## 2.6 Runtime frame audit and the detached-part fix

**Correction to this section's earlier claim.** An earlier pass here reported
this as fixed and verified -- it was not. That version treated the "0.000m"
result from `audit_runtime_adjacency.mjs` as proof of correct adjacency, and
it is not: the check is a closest-SURFACE-point distance, which one extreme
corner of two mostly-unrelated masses can satisfy while the masses themselves
sit metres apart. A screenshot taken after that "fix" showed the exact same
floating blue/black parts as before, and the discrepancy between "numeric test
says fine, screenshot says broken" was the actual signal, not something to
explain away. Root-caused and fixed below; screenshots and the corrected
numbers are what back this entry now, not the adjacency check alone.

**Root cause.** `Robot1_EKSEN1.stp` and `Robot1_EKSEN2.stp` (and, by
extension, every EKSEN*.stp pair) are independent STEP exports that do **not**
share a common origin. The gantry renderer's transform chain only ever
applied the live SLIDER offset between axes -- for axis 1 -> axis 2, an
X-only translation -- on the assumption that the two files' frames already
agreed on every other axis. They do not: axis 2's own mounting plate
(`2_Eksen_Robot_Plakasi_SYM`, CAD centre ~(1495, -2982, -362)mm) and the
carriage on axis 1's rail that it actually bolts onto
(`_1_Eksen_Hareketli_SYM`, CAD centre ~(-12065, 3160, -720)mm) are ~4.9m apart
in Y before any correction. The two meshes still touched at one far corner
(hence the misleading "0.000m" reading), while the bulk of each sat metres
from the other -- confirmed by measuring both reference parts directly in the
STEP data, and cross-checked against the live-rendered scene's actual runtime
world positions in a browser (`document.body`-appended debug log reading
`object.getWorldPosition()`/parent chain, not console capture -- Playwright's
console listener silently missed messages logged this early in page load in
this environment, which cost real time before switching to the DOM).

**Fix.** `AXIS2_FRAME_CORRECTION_MM` in the gantry renderer adds a constant
Y/Z offset to the `axis-1-carriage` group, on top of (not replacing) the
existing X/slider calibration:

- **Y** (6142mm): centroid-to-centroid. Y is the mounting plate's short axis,
  not a stacking direction, so matching the two parts' centres is correct
  here.
- **Z** (267mm): face-to-face, not centroid-to-centroid. Axis 2 stands ON TOP
  of the carriage, so its base plate's bottom face (Z ~ -712mm) has to land on
  the carriage's top face (Z ~ -445mm). The first attempt at this fix used
  centroid-matching for Z too (giving -358mm) and it visibly did not close the
  gap -- centroid-matching a stacked joint offsets the parts by roughly half
  of each one's own height, which is exactly the wrong operation for a
  "stands on top of" relationship. `find_mount_face.py` is the
  tool that found the actual bottom/top faces to fix this: it lists a STEP
  file's lowest-Z named solids (crop-filtered to the installed copy, fasteners
  dropped by size) instead of using the whole assembly's bbox centre, which
  mixes the bottom mounting plate with wherever the top of the column reaches.

**Result, measured (not eyeballed):** the X gap between axis 1 and axis 2's
world bboxes went from 4.86m to 1.28m; after the Z fix, axis 2's mounting
face and the carriage's top face land at the identical world Y (0.923m,
computed from each side independently). A before/after screenshot at a fixed
camera angle shows the column now standing recognisably out of the rail
carriage instead of floating free of it.

**Follow-up verification completed:**
- `chain_frame_check.py` now reports 0.000 mm at axis2→axis3 and the corrected
  axis3→axis4 interface; axis4→axis5 is the measured 8.515 mm flange clearance.
  The installed zero-pose audit reports 0.0 mm bbox gap for every structural
  link pair; the 110–115 mm camera separation remains the declared
  `CAMERA_MOUNT` assumption.
- Robot2's own chain is included in the same audit and mirrors Robot1 across
  the bus plane. `verify_cell_fit.mjs` reports both rails inside the shell with
  0.44 m roof clearance and no IFARLAB overlap.
- A **thin dotted-line artifact** is still visible near some parts in
  screenshots taken after this fix, consistent with the `DIMENSION` records
  noted below -- worth re-checking whether the solids-only filter is missing
  a case, though it is now a minor cosmetic issue rather than the dominant
  symptom.

`npm --prefix client run inspection:inspect-meshes` loads every installed GLB by itself
and prints its hi/lo local bbox centres, then its world bbox and parent chain
for both portals -- useful for confirming axis 1 through camera all exist
under `Z -> Y -> X -> AX -> AZ -> camera`, but it does not catch the
cross-file frame issue above (it doesn't have a second file's reference point
to compare against). `audit_runtime_adjacency.mjs`'s closest-surface-distance
check has the same limitation described above -- treat "0.000m" there as "at
least one point touches", not "these are correctly mounted".

The STEP text contains a small number of `DIMENSION` records but no
`ANNOTATION`, `SKETCH`, `CONSTRUCTION` or `GEOMETRIC_CURVE_SET` entities. The
converter now additionally requires an imported object to contain at least one
solid before tessellating it, so PMI/construction geometry cannot regress into
visible GLB props -- though see the dotted-line note above; this may not be
fully closed.

Both `hi` and `lo` GLB tiers use the same corrected runtime frame chain. Their
URLs carry a revision query (`v=2026-09-23-framefix-3` as of the X fix in
section 2.7), which invalidates both the browser cache and GLTFLoader's
URL-keyed cache after a mesh/frame update; the static file contents remain
identical between requests.

## 2.7 The ~1.3m residual X gap, root-caused

Section 2.6 left the X gap between axis 1 and axis 2 unexplained: the Y/Z fix
there closed the vertical and lateral misalignment but a ~1.3m gap remained
in X, and `CAD_POSE.a1 = 13474` (chosen only to centre the 16m slider travel
on the rail's own 16.207m span) had never actually been checked against where
the carriage sits in EKSEN1's own frame.

**Root cause: the same bug as Y/Z, just in the axis nobody had audited.**
The gantry renderer moved axis 2 in X *only* via the live a1 slider term
(`(a1 - CAD_POSE.a1) * MM`), which encodes the carriage's *travel* along the
rail, not the fixed offset between EKSEN1's and EKSEN2's unrelated file
origins -- exactly the gap Y and Z already needed a constant correction for.
There was no equivalent constant for X; `AXIS2_FRAME_CORRECTION_MM` only had
`y`/`z` keys, and the code assumed X needed none.

**Also found while checking this: the carriage was never rendered.**
The gantry renderer only ever draws two things from axis 1's file: the
static `axis1` rail (`showRails`) and, moving with the a1 slider, the `axis2`
mesh (the vertical column, from `Robot1_EKSEN2.stp`). The physical carriage
block that actually rides the rail and carries the column --
`_1_Eksen_Hareketli_SYM`, inside `Robot1_EKSEN1.stp` -- had no mesh of its own
in the scene at all, so there was nothing to visually anchor axis 2 to as it
moved. `convert.py`'s `AXIS1_ROLE=carriage` mode (see section 3) already
exists to export exactly this branch on its own; `axis1_carriage.glb` (hi and
lo) is now built and rendered as the direct child of the `axis-1-carriage`
group, ahead of the axis-2 correction below, so it takes only the a1 slider
term and no cross-file correction (it's already in EKSEN1's frame).

**Fix.** `AXIS2_FRAME_CORRECTION_MM` gained an `x` key (-13559mm), matched by
the same method already used for Y (see section 2.6): centroid-to-centroid
between `2_Eksen_Robot_Plakasi_SYM` (axis 2's own base plate, CAD centre
X = 1494.5mm) and `_1_Eksen_Hareketli_SYM` (the carriage, CAD centre
X = -12064.7mm). X is a horizontal, non-stacking axis for this joint just
like Y, so centroid-matching is the right operation, not face-matching.
Re-deriving Y from these same two parts with FreeCAD gives 6142.4mm against
the existing 6142mm constant -- the method reproduces the already-verified
value almost exactly, which is the cross-check that it's the right method for
X too.

The correction is now applied on a dedicated static group (`axis-2-frame`)
nested inside the a1-driven slider group, rather than being written onto the
slider group itself every frame -- the slider group's only job is the a1
term, in EKSEN1's frame, since it now also carries the carriage mesh
directly.

**Result, measured with `audit_runtime_adjacency.mjs`:** at the exported CAD
pose (a1 = 13474mm) the axis1_carriage/axis2 boundary reports a 0.000m
bbox gap and a 0.000m triangle gap, for both robots and both LOD tiers --
the same exact-touch precision the Y/Z fix already achieved, now covering X
too. (The script's own pose-sweep table, and the `axis1`/`axis1_carriage` gap
it also now reports, move with a1 as expected -- that pair opens up away from
the exported pose because the carriage is riding along a 16m rail, which is
correct behaviour, not a new defect.)

## 3. Conversion pipeline

The inspection mesh build needs FreeCAD 1.1 and npx on PATH.

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
npm --prefix client run inspection:build-meshes                        # all parts
npm --prefix client run inspection:build-meshes -- Robot1_EKSEN3  # one part
```

Set `INSPECTION_RAW_CAD` to the directory containing the approved STEP files. Run the commands from the repository root.
