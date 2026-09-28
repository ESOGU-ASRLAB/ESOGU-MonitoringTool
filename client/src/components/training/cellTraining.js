/*
 * THE PICK-AND-PLACE TRAINING'S LINE TO THE UR10e.
 *
 * PickPlaceStation (in the headset) and IfarlabTasks (the arm's program)
 * share this object, read and written in their frame loops -- no React state,
 * so a box handed over does not re-render the hall.
 *
 *   active   a training owns the arm: at the end of its cycle it waits for a
 *            box from the wearer instead of feeding itself one
 *   run      bumped when a training starts; the cell clears its table for it
 *   feeds    boxes handed over and not yet taken, each { y, taken } -- y is
 *            where on the infeed it starts, in the workcell frame (metres)
 *   placed   boxes the arm has set on the table since the page opened
 *   waiting  the arm is at home, waiting for a box
 */
export const cellTraining = {
  active: false,
  run: 0,
  feeds: [],
  placed: 0,
  waiting: false,
};
