import React, { Suspense } from 'react';
import OtokarMesh from './OtokarMesh';
import { OTOKAR_BODY_MATERIAL } from './otokarCadPalette';
import { RAIL_INNER_FACE_MM, RAIL_REAR_X_MM, RAIL_FOOT_TOP_MM } from './otokarCellGeometry';

/*
 * The bus body under inspection (16N37D-1__01092026.stp), positioned relative
 * to the gantry rails.
 *
 * ---------------------------------------------------------------------------
 * PLACEMENT SOURCE
 *
 * All three offsets are real measurements taken off the SolidWorks assembly
 * and reported in MATISSE_Araç_Konumu.pptx. They are used verbatim; nothing
 * here is an estimate.
 *
 *   SIDE_CLEARANCE_MM  1643.6612  rail side face  -> body side face
 *   REAR_OFFSET_MM     1160.4634  rail rear end   -> body rear end
 *   GROUND_HEIGHT_MM   1646.2384  rail foot's TOP MOUNTING FACE -> body
 *                                 underside. Measured from the foot's top
 *                                 face, not from the floor, which is why it is
 *                                 applied to RAIL_FOOT_TOP_MM.
 *
 * The rail-side half of each measurement is read out of the CAD rather than
 * retyped -- see otokarCellGeometry.js. The side clearance is applied
 * symmetrically (OtokarCell.js puts one rail either side of the body), which
 * is how the deck's own cell drawings show it.
 * ---------------------------------------------------------------------------
 */

const MM = 0.001;

export const SIDE_CLEARANCE_MM = 1643.6612;
export const REAR_OFFSET_MM = 1160.4634;
export const GROUND_HEIGHT_MM = 1646.2384;

/*
 * The body's own reference faces in ITS OWN CAD frame, in mm.
 *
 * These are PERCENTILES of the converted mesh's vertex cloud (0.5 % / 99.5 %),
 * not its bounding box. The export carries assembly fixtures and jig geometry
 * that reach well outside the body -- the raw box is 4.82 m across in Y and
 * 4.50 m tall, against a real body of 2.50 m by 2.71 m -- so the extremes
 * describe the jig, not the vehicle. The percentile cut lands on the body
 * itself, and the result checks out: +/-1251 mm half width is a 2.50 m body,
 * and the 11.86 m length matches the root part 16N37D-1__01092026.
 *
 * ASSUMED, each a single value away from correction if the cell drawings say
 * otherwise: that -X is the body's REAR (it is the end the rail overhangs),
 * and that the body's centreline belongs midway between the two rails.
 */
export const BODY_REAR_X_MM = -9556.0;
export const BODY_UNDERSIDE_Z_MM = 172.0;
const BODY_CENTRELINE_Y_MM = 0.0;
export const BODY_HALF_WIDTH_MM = 1251.0;

/*
 * Where the body's centreline sits in a robot's own CAD frame.
 *
 * KNOWN WRONG -- RETRACTED REASONING, VALUE NOT YET CORRECTED.
 *
 * This applies the 1643.6612 mm clearance ONCE, inward from the rail face,
 * landing the centreline near Y = -137 mm. The justification was that each
 * robot is a complete PORTAL with columns at BOTH Y ~ +3170
 * (`2_Eksen_Sabit_SYM`) and Y ~ -3080 (`2_Konstruksiyon_SYM`), so the body
 * passes through the opening.
 *
 * There is no second column. `2_Konstruksiyon_SYM` is an unplaced master copy
 * of the same one, and the cell is two independent parallel rails with the
 * body BETWEEN them -- so the clearance is measured from each rail to the body
 * beside it, and this single-sided formula does not express that. Left as-is
 * deliberately until the two-rail layout lands, so the change is one thing at
 * a time. See docs/inspection-cell-cad-notes.md, "RETRACTED: the cell is two portals on
 * one runway".
 */
export const BODY_CENTRELINE_IN_ROBOT_MM =
  RAIL_INNER_FACE_MM - SIDE_CLEARANCE_MM - BODY_HALF_WIDTH_MM;

/*
 * Offsets that move the body's own reference faces onto the measured points,
 * in the robot's CAD frame (both robots share it -- they straddle one body).
 */
export const BUS_OFFSET_MM = [
  RAIL_REAR_X_MM + REAR_OFFSET_MM - BODY_REAR_X_MM,
  BODY_CENTRELINE_IN_ROBOT_MM - BODY_CENTRELINE_Y_MM,
  RAIL_FOOT_TOP_MM + GROUND_HEIGHT_MM - BODY_UNDERSIDE_Z_MM,
];

/*
 * Body metal, not a drawing.
 *
 * The per-surface colours come from OtokarMesh's cadColors path, which tones
 * the structure by height and run direction; this only sets the FINISH the
 * whole shell shares. The body used to render as coloured edges over hidden
 * surfaces, so it read as a blueprint floating in the cell. These figures are
 * bare steel at the inspection station -- part-way metallic, fairly matte --
 * rather than a finished topcoat, which this shell does not have yet.
 */
const BUS_MATERIAL = { ...OTOKAR_BODY_MATERIAL, metalness: 0.35, roughness: 0.55 };

/*
 * A missing body mesh must not take the cell down with it. The 118 MB source
 * model is the asset most likely to be absent on a fresh checkout -- it is
 * git-ignored raw CAD until someone runs the build script -- and useGLTF
 * throws on a 404 rather than resolving to null.
 */
class BusMeshBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    // eslint-disable-next-line no-console
    console.warn(
      'Inspection bus body mesh unavailable',
      error,
    );
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default function OtokarBusBody({ show = true, lod = 'hi' }) {
  if (!show) return null;

  return (
    <BusMeshBoundary>
      <Suspense fallback={null}>
        {/* Same CAD Z-up -> three Y-up conversion the robots apply. */}
        <group rotation={[-Math.PI / 2, 0, 0]}>
          {/* BUS_OFFSET_MM stays in the CAD-local basis; the parent root's
              -90° X rotation performs the single frame conversion. */}
          <group name="inspection-bus-body" position={BUS_OFFSET_MM.map((v) => v * MM)}>
            <OtokarMesh
              group="bus"
              part="body"
              lod={lod}
              material={BUS_MATERIAL}
              cadColors
            />
          </group>
        </group>
      </Suspense>
    </BusMeshBoundary>
  );
}
