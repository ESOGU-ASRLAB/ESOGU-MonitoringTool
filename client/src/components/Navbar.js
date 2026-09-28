import React, { useEffect, useRef, useState } from 'react';
import './Navbar.css';

const LOGO_BASE = `${process.env.PUBLIC_URL}/assets/logo/`;

// Below this width the links, partner marks and clock fold into the menu
// panel behind the toggle. Keep in step with the 1180px queries in Navbar.css.
const COMPACT_QUERY = '(max-width: 1180px)';

/*
 * Pages are chosen by path (App.js), and every link is a full page load, so the
 * current page is simply read off the URL. Home is whatever is not a guide.
 */
const NAV_LINKS = [
  { id: 'home', href: '/', label: 'Home' },
  { id: 'docs', href: '/docs', label: 'Documentation' },
  { id: 'vr', href: '/vr', label: 'VR Integration' },
];

function currentPage() {
  const path = window.location.pathname;
  if (/^\/docs\/?$/.test(path)) return 'docs';
  if (/^\/vr\/?$/.test(path)) return 'vr';
  return 'home';
}

/*
 * Each partner mark links to its own organisation. They open in a new tab so
 * following one never unloads the live twin, and each image's alt text is the
 * organisation's name, which is what the link is announced as. Otokar is shown
 * but not linked -- there is no site for it here. Otokar is a wordmark rather
 * than a round seal, so it is set smaller to carry the same visual weight.
 */
const PARTNERS = [
  { name: 'Eskişehir Osmangazi University', src: 'logo3.png', href: 'https://www.ogu.edu.tr/' },
  { name: 'ASRLab', src: 'asrlab.webp', href: 'https://srlab.ogu.edu.tr/' },
  { name: 'IFARLAB', src: 'ifarlab.webp', href: 'https://ifarlab.ogu.edu.tr/' },
  { name: 'Otokar', src: 'logo2.png', wordmark: true },
];

function LiveClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const time = now.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const date = now.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  return (
    <span className="live-clock">
      <span className="live-clock-time">{time}</span>
      <span className="live-clock-date">{date}</span>
    </span>
  );
}

function PartnerMarks({ className }) {
  return (
    <div className={className}>
      {PARTNERS.map((p) => {
        const img = (
          <img
            className={`partner-logo${p.wordmark ? ' is-wordmark' : ''}`}
            src={LOGO_BASE + p.src}
            alt={p.name}
          />
        );
        return p.href ? (
          <a key={p.name} className="partner-link" href={p.href} target="_blank" rel="noopener noreferrer" title={p.name}>
            {img}
          </a>
        ) : (
          <span key={p.name} className="partner-link" title={p.name}>{img}</span>
        );
      })}
    </div>
  );
}

function MenuIcon({ open }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      {open ? (
        <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      ) : (
        <path d="M3 5.5h14M3 10h14M3 14.5h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      )}
    </svg>
  );
}

export default function Navbar({ liveStatus }) {
  const statusLabel = liveStatus === 'live' ? 'Live' : liveStatus === 'offline' ? 'Offline' : 'Connecting';
  const page = currentPage();
  const [menuOpen, setMenuOpen] = useState(false);
  const toggleRef = useRef(null);

  // While the menu is open: Escape closes it (focus back on the toggle), and
  // widening past the compact breakpoint closes it, since the panel it lives
  // in is no longer shown there.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      setMenuOpen(false);
      toggleRef.current?.focus();
    };
    const compact = window.matchMedia(COMPACT_QUERY);
    const onChange = (event) => {
      if (!event.matches) setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    compact.addEventListener('change', onChange);
    return () => {
      window.removeEventListener('keydown', onKey);
      compact.removeEventListener('change', onChange);
    };
  }, [menuOpen]);

  return (
    <header className="navbar">
      <div className="navbar-brand">
        <a className="navbar-brand-logo" href="https://matisse-kdt.eu/" target="_blank" rel="noopener noreferrer" title="MATISSE">
          {/* The reversed mark for the dark bar: the blue letters white, the teal kept. */}
          <img src={LOGO_BASE + 'logo-light.svg'} alt="MATISSE" />
        </a>
        <span className="navbar-product">Monitoring Tool</span>
      </div>

      <PartnerMarks className="navbar-partners" />

      <nav className="navbar-nav" aria-label="Main">
        {NAV_LINKS.map((link) => (
          <a key={link.id} href={link.href} aria-current={page === link.id ? 'page' : undefined}>
            {link.label}
          </a>
        ))}
      </nav>

      <div className="navbar-status">
        <span className="live-badge" data-status={liveStatus} role="status" aria-label={`Telemetry: ${statusLabel}`}>
          <span className="live-dot" aria-hidden="true" />
          <span className="live-label" aria-hidden="true">{statusLabel}</span>
        </span>
        <span className="navbar-status-clock">
          <LiveClock />
        </span>
      </div>

      <button
        ref={toggleRef}
        type="button"
        className="navbar-toggle"
        aria-expanded={menuOpen}
        aria-controls="navbar-menu"
        aria-label={menuOpen ? 'Close menu' : 'Open menu'}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <MenuIcon open={menuOpen} />
      </button>

      {menuOpen && (
        <>
          <div className="navbar-backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" />
          <div id="navbar-menu" className="navbar-menu">
            <nav className="navbar-menu-nav" aria-label="Main">
              {NAV_LINKS.map((link) => (
                <a key={link.id} href={link.href} aria-current={page === link.id ? 'page' : undefined}>
                  {link.label}
                </a>
              ))}
            </nav>
            <div className="navbar-menu-section">
              <p className="navbar-menu-label">Partners</p>
              <PartnerMarks className="navbar-menu-partners" />
            </div>
            <div className="navbar-menu-section">
              <p className="navbar-menu-label">Local time</p>
              <LiveClock />
            </div>
          </div>
        </>
      )}
    </header>
  );
}
