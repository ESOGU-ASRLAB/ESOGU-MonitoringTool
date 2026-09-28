import React, { useEffect, useState } from 'react';
import './Navbar.css';

function LiveClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const date = now.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const time = now.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <div className="live-clock">
      <span className="live-clock-time">{time}</span>
      <span className="live-clock-date">{date}</span>
    </div>
  );
}

/*
 * Each partner mark links to its own organisation. They open in a new tab so
 * following one never unloads the live twin, and each image's alt text is the
 * organisation's name, which is what the link is announced as. Otokar is shown
 * but not linked -- there is no site for it here.
 */
const LOGO_LINKS = [
  { name: 'MATISSE', src: 'logo.svg', href: 'https://matisse-kdt.eu/' },
  { name: 'Eskişehir Osmangazi University', src: 'logo3.png', href: 'https://www.ogu.edu.tr/' },
  { name: 'ASRLab', src: 'asrlab.png', href: 'https://srlab.ogu.edu.tr/' },
  { name: 'IFARLAB', src: 'ifarlab.png', href: 'https://ifarlab.ogu.edu.tr/' },
];

export default function Navbar({ liveStatus }) {
  const statusLabel = liveStatus === 'live' ? 'Live' : liveStatus === 'offline' ? 'Offline' : 'Connecting';

  return (
    <header className="navbar">
      <div className="navbar-logos">
        {LOGO_LINKS.map((logo) => (
          <a
            key={logo.href}
            className="navbar-logo-link"
            href={logo.href}
            target="_blank"
            rel="noopener noreferrer"
            title={logo.name}
          >
            <img className="navbar-logo" src={`${process.env.PUBLIC_URL}/assets/logo/${logo.src}`} alt={logo.name} />
          </a>
        ))}
        <img className="navbar-logo" src={`${process.env.PUBLIC_URL}/assets/logo/logo2.png`} alt="Otokar" />
      </div>
      <div className="navbar-heading">
        <span className="navbar-brand">
          <span className="navbar-title">Monitoring Tool</span>
        </span>
      </div>
      <nav className="navbar-links">
        <a className="navbar-home" href="/">Home</a>
        {/* Full labels need the widest screens; below 1300px they shorten
            (Navbar.css) rather than push the badge off the edge. */}
        <a className="navbar-home" href="/docs" aria-label="Documentation">
          <span className="navbar-link-full">Documentation</span>
          <span className="navbar-link-short" aria-hidden="true">Docs</span>
        </a>
        <a className="navbar-home" href="/vr" aria-label="VR Integration">
          <span className="navbar-link-full">VR Integration</span>
          <span className="navbar-link-short" aria-hidden="true">VR</span>
        </a>
      </nav>
      <div className="navbar-monitoring">
        <div className="live-badge" data-status={liveStatus} role="status" aria-label={statusLabel}>
          <span className="live-dot" aria-hidden="true" />
          <span className="live-label" aria-hidden="true">{statusLabel}</span>
        </div>
        <LiveClock />
      </div>
    </header>
  );
}
