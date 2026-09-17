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
      <span className="live-clock-date">{date}</span>
      <span className="live-clock-time">{time}</span>
    </div>
  );
}

/*
 * The three marks form one lockup, so they live in a single link rather than
 * three that all point at "/" -- three identical targets in a row is noise to
 * work through on a keyboard or a screen reader. Only the first carries alt
 * text for the same reason: the lockup names the site once.
 */
export default function Navbar({ liveStatus }) {
  const statusLabel = liveStatus === 'live' ? 'Live' : liveStatus === 'offline' ? 'Offline' : 'Connecting';
  const statusCaption = liveStatus === 'live'
    ? 'Streaming real robot data from the backend'
    : 'Backend not sending robot data';

  return (
    <header className="navbar">
      <a className="navbar-logos" href="/">
        <img
          className="navbar-logo"
          src={`${process.env.PUBLIC_URL}/assets/logo/logo.svg`}
          alt="MATISSE"
        />
        <img className="navbar-logo" src={`${process.env.PUBLIC_URL}/assets/logo/logo3.png`} alt="" />
        <img className="navbar-logo" src={`${process.env.PUBLIC_URL}/assets/logo/logo2.png`} alt="" />
      </a>
      <div className="navbar-heading">
        <span className="navbar-title">Monitoring Tool</span>
        <span className="navbar-version">3D Workcell Visualizer</span>
      </div>
      <div className="navbar-monitoring">
        <div className="live-badge" data-status={liveStatus} role="status" aria-label={`${statusLabel}: ${statusCaption}`}>
          <span className="live-dot" aria-hidden="true" />
          <span className="live-label" aria-hidden="true">{statusLabel}</span>
          <span className="live-caption" aria-hidden="true">{statusCaption}</span>
        </div>
        <LiveClock />
      </div>
      <a className="navbar-home" href="/">Home</a>
    </header>
  );
}
