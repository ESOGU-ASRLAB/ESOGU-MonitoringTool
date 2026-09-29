import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { setPresenceName, usePeers } from './presence';
import './VisitorName.css';

/*
 * NAMES FOR THE PEOPLE IN VR, AND WHO IS IN THERE.
 *
 *   VREntryDialog   Enter VR asks for the wearer's name first -- on the page,
 *                   with the headset browser's own keyboard, since there is
 *                   none worth using inside VR. Remembered on the device and
 *                   offered again next time; left empty, the wearer is
 *                   "Visitor N". Web visitors are not asked: they stay
 *                   "Visitor N", and DigitalTwin clears the name on leaving VR.
 *   VRRoster        on the web page, the people in VR right now, each with a
 *                   blinking green light, live from presence: a name appears
 *                   the moment its wearer enters and goes when they leave.
 *
 * Names go to the presence server with each hello (presence.js), which
 * cleans them the same way and never stores them.
 */

const NAME_KEY = 'matisse-vr-name';
export const NAME_MAX = 24;

// The same rule as the server (api/presence.js): letters in any script,
// digits, spaces and . ' - _, at most NAME_MAX characters.
export function cleanName(value) {
  return [...String(value || '').normalize('NFC').replace(/[^\p{L}\p{M}\p{N} .'\-_]/gu, '').replace(/\s+/g, ' ').trim()]
    .slice(0, NAME_MAX)
    .join('')
    .trim();
}

function readName() {
  try {
    return cleanName(window.localStorage.getItem(NAME_KEY));
  } catch {
    return '';
  }
}

function writeName(value) {
  try {
    window.localStorage.setItem(NAME_KEY, value);
  } catch {
    // Private mode or storage off: the name lasts this visit only.
  }
}

/**
 * Asks for the wearer's name, then calls onEnter() -- from the button's own
 * click, so the browser still counts it as the gesture WebXR needs.
 */
export function VREntryDialog({ onEnter, onCancel }) {
  const [draft, setDraft] = useState(readName);

  const enter = () => {
    const name = cleanName(draft);
    writeName(name);
    setPresenceName(name);
    onEnter();
  };

  // Rendered into <body>: the Enter VR button sits in the view controls,
  // whose backdrop-filter would otherwise hold a fixed overlay inside them.
  return createPortal((
    <div
      className="visitor-name-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="vr-name-title"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onCancel();
      }}
    >
      <form
        className="visitor-name-card"
        onSubmit={(event) => {
          event.preventDefault();
          enter();
        }}
      >
        <h2 id="vr-name-title">Your name in VR</h2>
        <p>
          Others in the hall see it over your worker, and the web page lists who is in VR.
          Leave it empty to stay &quot;Visitor&quot;. It is never stored on the server.
        </p>
        <input
          autoFocus
          type="text"
          value={draft}
          maxLength={NAME_MAX}
          placeholder="Your name"
          aria-label="Your name in VR"
          autoComplete="nickname"
          onChange={(event) => setDraft(event.target.value)}
        />
        <div className="visitor-name-actions">
          <button type="button" className="visitor-name-skip" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="visitor-name-join">
            Enter VR
          </button>
        </div>
      </form>
    </div>
  ), document.body);
}

/** Who is in VR right now, each with a blinking green light; nothing when nobody is. */
export function VRRoster() {
  const peers = usePeers();
  const inVR = peers.filter((peer) => peer.kind === 'vr');
  if (inVR.length === 0) return null;
  return (
    <div className="vr-roster" aria-live="polite">
      <div className="vr-roster-head">
        In VR now
        <span className="vr-roster-count">{inVR.length}</span>
      </div>
      <ul>
        {inVR.map((peer) => (
          <li key={peer.id}>
            <span className="vr-roster-dot" aria-hidden="true" />
            <span className="vr-roster-name">{peer.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
