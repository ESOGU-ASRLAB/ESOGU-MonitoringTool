/*
 * Reference faces of the Otokar MATISSE gantry, read out of the STEP assembly.
 *
 * The bus body's three measured clearances (see OtokarBusBody.js) are all
 * measured FROM the rail, so the rail-side half of each has to come from the
 * same CAD as the rail model rather than being typed in independently. Each
 * value below was measured with scripts/otokar/query_part.py against
 * Robot1_EKSEN1.stp; the matching command is quoted so it can be re-checked.
 *
 * All values are in the robot's own CAD frame, in millimetres, Z up.
 */

/*
 * Inner side face of the rail beam -- the face the bus clearance is measured
 * from. The four `Konstruksiyon_modul` rail modules span Y 2757.4 .. 3563.9,
 * so the beam is 806.5 mm wide on a 3160.65 mm centreline and its inner face
 * (the machine hangs off the -Y side) is at 2757.4.
 *
 *   PART_RE="^Konstruksiyon_modul" scripts/otokar/query_part.py
 */
export const RAIL_INNER_FACE_MM = 2757.4;

/*
 * Rear end of the rail structure: the axis-1 mesh's own -X extreme.
 */
export const RAIL_REAR_X_MM = -12724.986;

/*
 * Top mounting face of the floor feet, and the floor itself.
 *
 * The `Yere_Baglanti_Set` floor-fixing assemblies span Z -1748.0 .. -1368.0.
 * That 380 mm is exactly the length of the `Fischer_M16x380_Saplama` anchor
 * studs they contain, so the studs are the embedded part and the concrete
 * surface is the top of that range: the foot's top mounting face at -1368 IS
 * floor level. That reading also makes the deck's 1646.2384 mm ride height
 * put the body underside 278 mm above the floor, which is a normal bus ride
 * height -- taking -1748 as the floor instead would put it at 2 m.
 *
 *   PART_RE="Yere_baglanti_ayagi|Yere_Baglanti_Set" scripts/otokar/query_part.py
 */
export const RAIL_FOOT_TOP_MM = -1368.0;
export const FLOOR_Z_MM = -1368.0;
