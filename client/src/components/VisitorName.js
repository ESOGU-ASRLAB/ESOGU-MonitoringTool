import React, { useEffect, useState } from 'react';
import { setPresenceName } from './presence';
import './VisitorName.css';

/*
 * WHO YOU ARE IN THE HALL.
 *
 * Everyone on the page stands in the hall as a worker with a name tag
 * (Visitors.js); the tag read "Visitor 3" until people could say who they
 * are. On the first visit to the twin a small dialog asks for a name -- Skip
 * keeps "Visitor N" -- and it is remembered on this device, sent to the
 * presence server with each connection (presence.js) and never stored
 * there. The chip under the view controls shows it and reopens the dialog.
 *
 * A headset has no keyboard worth using inside VR, so this is asked on the
 * page, before Enter VR.
 */

const NAME_KEY = 'matisse-visitor-name';
const ASKED_KEY = 'matisse-visitor-asked';
export const NAME_MAX = 24;

// The same rule as the server (api/presence.js): letters in any script,
// digits, spaces and . ' - _, at most NAME_MAX characters.
export function cleanName(value) {
  return [...String(value || '').normalize('NFC').replace(/[^\p{L}\p{M}\p{N} .'\-_]/gu, '').replace(/\s+/g, ' ').trim()]
    .slice(0, NAME_MAX)
    .join('')
    .trim();
}

function read(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private mode or storage off: the name lasts this visit only.
  }
}

export default function VisitorName() {
  const [name, setName] = useState(() => cleanName(read(NAME_KEY)));
  const [open, setOpen] = useState(() => read(ASKED_KEY) !== '1');
  const [draft, setDraft] = useState(name);

  useEffect(() => {
    setPresenceName(name);
  }, [name]);

  const save = (value) => {
    const clean = cleanName(value);
    setName(clean);
    write(NAME_KEY, clean);
    write(ASKED_KEY, '1');
    setOpen(false);
  };

  // Escape closes without changing anything.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') {
        write(ASKED_KEY, '1');
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const valid = cleanName(draft).length > 0;

  return (
    <>
      <button
        type="button"
        className="visitor-name-chip"
        onClick={() => {
          setDraft(name);
          setOpen(true);
        }}
        title="The name others in the hall see over your worker"
      >
        <span className="visitor-name-dot" aria-hidden="true" />
        <span className="visitor-name-text">{name || 'Set your name'}</span>
      </button>
      {open && (
        <div className="visitor-name-backdrop" role="dialog" aria-modal="true" aria-labelledby="visitor-name-title">
          <form
            className="visitor-name-card"
            onSubmit={(event) => {
              event.preventDefault();
              if (valid) save(draft);
            }}
          >
            <h2 id="visitor-name-title">What&apos;s your name?</h2>
            <p>
              Others in the hall, on the web or in a headset, see it over your worker. It is only
              sent while you are here and never stored.
            </p>
            <input
              autoFocus
              type="text"
              value={draft}
              maxLength={NAME_MAX}
              placeholder="Your name"
              aria-label="Your name"
              autoComplete="nickname"
              onChange={(event) => setDraft(event.target.value)}
            />
            <div className="visitor-name-actions">
              <button type="button" className="visitor-name-skip" onClick={() => save(name)}>
                {name ? 'Cancel' : 'Skip'}
              </button>
              <button type="submit" className="visitor-name-join" disabled={!valid}>
                {name ? 'Save' : 'Join the hall'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
