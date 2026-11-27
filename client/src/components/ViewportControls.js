import React, { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../LanguageContext';
import { FACTORY_CAMERA_VIEWS } from './useFactoryCamera';

const ICONS = {
  monitoring: <><path d="M3 5h18v14H3z" /><path d="M5.5 12h3l2-3 2.5 6 2-3h3.5" /></>,
  camera: <><path d="M5 8V5h3m8 0h3v3m0 8v3h-3m-8 0H5v-3" /><circle cx="12" cy="12" r="3.5" /></>,
  walk: <><circle cx="13" cy="4" r="2" /><path d="m7 22 3-5 1-4m4 9v-5l-4-4 1-5-3 1-3 4m6-5 3 4h4" /></>,
  play: <path d="m9 5 11 7-11 7z" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="1" />,
  chevron: <path d="m7 10 5 5 5-5" />,
  up: <path d="m7 14 5-5 5 5" />,
  down: <path d="m7 10 5 5 5-5" />,
  left: <path d="m14 7-5 5 5 5" />,
  right: <path d="m10 7 5 5-5 5" />,
  minus: <path d="M6 12h12" />,
  plus: <path d="M6 12h12m-6-6v12" />,
};

export function ViewportIcon({ name }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {ICONS[name]}
    </svg>
  );
}

const DIRECTIONS = [
  { id: 'up', walk: [1, 0], orbit: [0, -1], move: ['Move forward', 'İleri git'], turn: ['Rotate up', 'Yukarı çevir'] },
  { id: 'left', walk: [0, -1], orbit: [-1, 0], move: ['Move left', 'Sola git'], turn: ['Rotate left', 'Sola çevir'] },
  { id: 'right', walk: [0, 1], orbit: [1, 0], move: ['Move right', 'Sağa git'], turn: ['Rotate right', 'Sağa çevir'] },
  { id: 'down', walk: [-1, 0], orbit: [0, 1], move: ['Move backward', 'Geri git'], turn: ['Rotate down', 'Aşağı çevir'] },
];

export default function ViewportControls({
  onStartPresentation, loading, walking, onToggleWalk, onMove, onOrbit, onZoom,
  cameraShot, cameraTouring, onSelectCameraShot, onStartCameraTour, onReleaseCamera,
  vrSupported, inVR, onToggleVR,
}) {
  const { language } = useLanguage();
  const tr = language === 'tr';
  const [cameraOpen, setCameraOpen] = useState(false);
  const cameraGroup = useRef(null);
  const cameraToggle = useRef(null);

  useEffect(() => {
    if (!cameraOpen) return;
    const closeOutside = (event) => {
      if (!cameraGroup.current?.contains(event.target)) setCameraOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setCameraOpen(false);
      cameraToggle.current?.focus();
    };
    window.addEventListener('pointerdown', closeOutside, true);
    window.addEventListener('keydown', closeOnEscape, true);
    return () => {
      window.removeEventListener('pointerdown', closeOutside, true);
      window.removeEventListener('keydown', closeOnEscape, true);
    };
  }, [cameraOpen]);

  const simulation = tr ? 'Simülasyonu başlat' : 'Start simulation';
  const camera = tr ? 'Kamera kontrolleri' : 'Camera controls';
  const walkLabel = tr ? 'Yürüme' : 'Walk';
  const vr = inVR ? (tr ? 'VR’dan çık' : 'Exit VR') : (tr ? 'VR’a gir' : 'Enter VR');
  const selectedView = FACTORY_CAMERA_VIEWS.find((view) => view.angles.some(({ shot }) => shot === cameraShot));
  const currentView = selectedView ?? FACTORY_CAMERA_VIEWS[0];
  const closeCamera = () => {
    setCameraOpen(false);
    cameraToggle.current?.focus();
  };

  return (
    <div className="view-primary">
      <button type="button" className="view-action view-run" disabled={loading}
        onClick={onStartPresentation} aria-label={simulation} title={tr ? 'Sesli sunumu başlat' : 'Start the narrated presentation'}>
        <ViewportIcon name="play" />
        <span>{simulation}</span>
      </button>
      <div className="view-camera" ref={cameraGroup}>
        <button ref={cameraToggle} type="button" className={`view-action${cameraShot ? ' is-tracking' : ''}`} aria-label={camera} title={camera}
          aria-expanded={cameraOpen} aria-controls="twin-camera-controls" onClick={() => setCameraOpen((open) => !open)}>
          <ViewportIcon name="camera" />
          <span>{tr ? 'Kamera' : 'Camera'}</span>
        </button>
        <div id="twin-camera-controls" className="view-camera-panel" role="group" aria-label={camera} hidden={!cameraOpen}>
          <div className="view-camera-actions">
            <button type="button" className="view-action view-camera-tour"
              onClick={() => { (cameraTouring ? onReleaseCamera : onStartCameraTour)(); closeCamera(); }}>
              <ViewportIcon name={cameraTouring ? 'stop' : 'play'} />
              {cameraTouring ? (tr ? 'Kamera turunu durdur' : 'Stop camera tour') : (tr ? 'Kamera turu' : 'Camera tour')}
            </button>
            {cameraShot && !cameraTouring && (
              <button type="button" className="view-action" onClick={() => { onReleaseCamera(); closeCamera(); }}>
                {tr ? 'Serbest kamera' : 'Free camera'}
              </button>
            )}
          </div>
          <div className="view-camera-areas" role="group" aria-label={tr ? 'Fabrika alanları' : 'Factory areas'}>
            {FACTORY_CAMERA_VIEWS.map((view) => (
              <button key={view.angles[0].shot} type="button" className="view-action"
                aria-pressed={view === currentView}
                onClick={() => onSelectCameraShot(view.angles[0].shot)}>
                {view[language]}
              </button>
            ))}
          </div>
          <div className="view-camera-angles" role="group" aria-label={tr ? 'Kamera açıları' : 'Viewing angles'}>
            {currentView.angles.map((angle) => (
              <button key={angle.shot} type="button" className="view-action" aria-pressed={cameraShot === angle.shot}
                onClick={() => { onSelectCameraShot(angle.shot); closeCamera(); }}>
                {angle[language]}
              </button>
            ))}
          </div>
          <div className="view-manual-camera" role="group" aria-label={tr ? 'Elle kamera kontrolü' : 'Manual camera controls'}>
            {DIRECTIONS.map(({ id, walk, orbit, move, turn }) => {
              const label = (walking ? move : turn)[tr ? 1 : 0];
              return (
                <button key={id} type="button" className="view-action"
                  onClick={() => walking ? onMove(...walk) : onOrbit(...orbit)} aria-label={label} title={label}>
                  <ViewportIcon name={id} />
                </button>
              );
            })}
            <button type="button" className="view-action" onClick={() => onZoom(1.25)} disabled={walking}
              aria-label={tr ? 'Uzaklaştır' : 'Zoom out'} title={tr ? 'Uzaklaştır' : 'Zoom out'}>
              <ViewportIcon name="minus" />
            </button>
            <button type="button" className="view-action" onClick={() => onZoom(0.8)} disabled={walking}
              aria-label={tr ? 'Yakınlaştır' : 'Zoom in'} title={tr ? 'Yakınlaştır' : 'Zoom in'}>
              <ViewportIcon name="plus" />
            </button>
          </div>
          {walking && <p className="view-walk-hint">{tr ? 'WASD veya yön tuşları' : 'WASD or arrow keys'}</p>}
          {vrSupported && (
            <button type="button" className="view-action view-camera-vr" onClick={() => { closeCamera(); onToggleVR(); }}>
              {vr}
            </button>
          )}
        </div>
      </div>
      <button type="button" className="view-action view-walk" aria-label={walkLabel} title={walkLabel}
        aria-pressed={walking} onClick={onToggleWalk}>
        <ViewportIcon name="walk" />
        <span>{walkLabel}</span>
      </button>
    </div>
  );
}
