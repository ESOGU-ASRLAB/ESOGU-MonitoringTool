import React from 'react';
import { Html } from '@react-three/drei';
import './CellLabel.css';

/*
 * The cell's name as a digital-twin annotation, not a physical sign: a small
 * dark tag over the cell at a constant on-screen size, its leader pointing
 * down at it. It reads from anywhere in the hall and never hides a robot.
 * The page's overlays (view controls, panels, the name prompt) sit at
 * z-index 10 and up, so the tags stay under them.
 *
 * The leader ends right over the middle of the cell (cell-local, Y-up), just
 * above its tallest things -- door and chassis frames stand to ~1.7-1.8 m, the
 * arms work lower -- so from the opening view (eye 2.5 m) each tag sits on top
 * of its own cell. Any higher and, seen from that eye height, the tags float
 * up against the far wall instead.
 */
const ANCHOR = [-0.77, 1.85, -1.25];

export default function CellLabel({ number, title }) {
  return (
    <Html position={ANCHOR} zIndexRange={[5, 0]} pointerEvents="none">
      <div className="cell-label">
        <div className="cell-label-tag">
          <span className="cell-label-number">{String(number).padStart(2, '0')}</span>
          {title}
        </div>
        <div className="cell-label-leader" />
        <div className="cell-label-dot" />
      </div>
    </Html>
  );
}
