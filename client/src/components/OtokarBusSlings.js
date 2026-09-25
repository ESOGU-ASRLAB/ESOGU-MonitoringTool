import React from 'react';
import { OTOKAR_ROBOT_LIVERY } from './otokarCadPalette';
import { BUS_OFFSET_MM } from './OtokarBusBody';
import { FLOOR_Z_MM } from './otokarCellGeometry';

/*
 * WHAT HOLDS THE BUS UP.
 *
 * Nothing did, and it showed: the body hung in mid-air over the cell.
 *
 * THIS IS NOT FROM THE CAD, and that is the first thing to know about it.
 * Otokar's files do not contain whatever carries the vehicle. The body is
 * placed by three measured clearances from the rail (see OtokarBusBody.js), not
 * by standing it on anything, and a search of Robot1_EKSEN1.stp for a support
 * came back empty: every solid reaching above the vehicle supports' own tops at
 * cell Z -843 belongs to the machine -- the column, the camera brackets, the
 * guide rails. The fastener filter was the obvious suspect, since it drops
 * anything matching `saplama` (stud) and the posts in Otokar's renders have
 * studs standing on them, but the only tall things it removes are bolt runs up
 * the column and the M16x380 floor anchors, which sit below the floor.
 *
 * The gap is 1 121 mm: the supports along the rail bed stop at cell Z -843 and
 * the body's underside is at +278.
 *
 * So these slings are a stand-in, drawn to stop the vehicle reading as
 * levitating, and every dimension below is chosen rather than measured. A body
 * in white does hang from an overhead conveyor in plenty of real shops, so the
 * shape is plausible -- but if Otokar supply the actual support, this file
 * should be deleted rather than adjusted.
 */

const MM = 0.001;

/*
 * The ceiling they hang from, measured AT THE SLINGS' OWN POSITIONS.
 *
 *   node scripts/otokar/roof_height.mjs  *     client/public/assets/factory/warehouse_blender.blend.glb 0.494663  *     -3.4 -2.9 3.4 4.0        -> 8.914 m
 *     -3.4 -2.9 -4.5 -3.9      -> 8.914 m
 *
 * Which spot is asked about matters, and this went wrong twice by not asking
 * carefully enough. The first version used 7 200 mm, from a remark elsewhere
 * about a 7.4 m minimum. The second measured the cell's whole footprint and got
 * 7 994 mm -- but that is the LOWEST member anywhere over the cell, and the
 * roof is vaulted, so directly above the slings it is 920 mm higher than that.
 * Both times the slings stopped in mid-air.
 *
 * 9 000 mm rather than 8 914: the roof is a truss, not a deck, and two of the
 * four slings sit over a gap in it. Running them a little past the members they
 * do meet reads as attached from below, where a sling ending exactly on a
 * plane that is not there does not.
 */
const CEILING_ABOVE_FLOOR_MM = 9000;

/*
 * Where they attach, along the vehicle. The body runs from cell X -11564 to
 * 290, so these sit roughly a fifth of its length in from each end -- about
 * where a two-point lift would take a 12 m shell.
 */
const ATTACH_X_MM = [-9600, -1700];

// Either side of the body's centre plane, inboard of the roof's edges.
const ATTACH_Y_OFFSET_MM = 620;

// Thick enough to read as lifting gear across a 12 m vehicle rather than
// disappearing into a hairline at any sensible camera distance.
const ROPE_RADIUS_MM = 22;

/*
 * The roof, in the cell frame: the converted body mesh's own top (Z 2 989 in
 * its CAD frame), carried over by the same offset OtokarBusBody applies to
 * everything else. If the body is rebuilt and its top moves, this is the one
 * figure to re-read -- scripts/otokar/glb_bbox.mjs prints it.
 */
const BODY_ROOF_Z_MM = 2989;
const ROOF_Z_MM = BODY_ROOF_Z_MM + BUS_OFFSET_MM[2];
const CENTRELINE_Y_MM = BUS_OFFSET_MM[1];
const CEILING_Z_MM = FLOOR_Z_MM + CEILING_ABOVE_FLOOR_MM;

/*
 * Satin steel, which in this palette is what exposed metal already wears.
 *
 * Black was tried first and vanished -- the slings hang against dark roof
 * trusses, and a dark strap in front of a dark truss reads as nothing. Amber
 * was tried next and was certainly visible, but it is the cell's one accent
 * colour and it belongs to the machines' mounting hardware; spending it on a
 * stand-in for geometry that is not in the CAD made the invented part the
 * loudest thing in the picture. A light steel cable shows against the roof
 * without claiming that much attention.
 */
const ROPE = {
  color: OTOKAR_ROBOT_LIVERY.satinSteel,
  metalness: 0.7,
  roughness: 0.35,
};

export default function OtokarBusSlings({ show = true }) {
  if (!show) return null;

  const length = (CEILING_Z_MM - ROOF_Z_MM) * MM;
  const midZ = ((CEILING_Z_MM + ROOF_Z_MM) / 2) * MM;

  return (
    // Same CAD Z-up -> three Y-up conversion the body and the robots apply at
    // their own roots, so these numbers stay in the cell's CAD frame.
    <group rotation={[-Math.PI / 2, 0, 0]}>
      {ATTACH_X_MM.map((x) =>
        [-ATTACH_Y_OFFSET_MM, ATTACH_Y_OFFSET_MM].map((dy) => (
          <group key={`${x}:${dy}`} position={[x * MM, (CENTRELINE_Y_MM + dy) * MM, midZ]}>
            {/* The cylinder's own axis is Y, and the parent's -90 deg X puts
                that along the cell's Z, which is where a sling hangs. */}
            <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[ROPE_RADIUS_MM * MM, ROPE_RADIUS_MM * MM, length, 8]} />
              <meshStandardMaterial
                color={ROPE.color}
                metalness={ROPE.metalness}
                roughness={ROPE.roughness}
              />
            </mesh>
            {/* A lifting eye where it meets the roof, so the sling lands on
                something rather than disappearing into the panel. */}
            <mesh position={[0, 0, -length / 2]} castShadow>
              <torusGeometry args={[60 * MM, 12 * MM, 8, 16]} />
              <meshStandardMaterial color={ROPE.color} metalness={0.5} roughness={0.5} />
            </mesh>
          </group>
        )),
      )}
    </group>
  );
}
