import React, { useEffect, useRef, useState } from 'react';
import './Navbar.css';
import { useLanguage } from '../LanguageContext';

const LOGO_BASE = `${process.env.PUBLIC_URL}/assets/logo/`;

// Below this width the links, partner marks and clock fold into the menu
// panel behind the toggle. Keep in step with the 1280px queries in Navbar.css.
const COMPACT_QUERY = '(max-width: 1280px)';

/*
 * Pages are chosen by path (App.js), and every link is a full page load, so the
 * current page is simply read off the URL. Home is whatever is not a guide.
 */
const NAV_LINKS = [
  { id: 'home', href: '/', en: 'Home', tr: 'Ana sayfa' },
  { id: 'docs', href: '/docs', en: 'Documentation', tr: 'Dokümantasyon' },
  { id: 'vr', href: '/vr', en: 'VR Integration', tr: 'VR Entegrasyonu' },
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
 * organisation's name, which is what the link is announced as.
 */
const PARTNERS = [
  { name: 'Eskişehir Osmangazi University', src: 'logo3.png', href: 'https://www.ogu.edu.tr/' },
  { name: 'ASRLab', src: 'asrlab.webp', href: 'https://srlab.ogu.edu.tr/' },
  { name: 'IFARLAB', src: 'ifarlab.webp', href: 'https://ifarlab.ogu.edu.tr/' },
];

function LiveClock() {
  const { language } = useLanguage();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const locale = language === 'tr' ? 'tr-TR' : 'en-GB';
  const time = now.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const date = now.toLocaleDateString(locale, {
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
      {PARTNERS.map((partner) => (
        <a key={partner.name} className="partner-link" href={partner.href} target="_blank" rel="noopener noreferrer" title={partner.name}>
          <img className="partner-logo" src={LOGO_BASE + partner.src} alt={partner.name} />
        </a>
      ))}
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
  const { language, setLanguage } = useLanguage();
  const tr = language === 'tr';
  const statusLabel = liveStatus === 'live' ? (tr ? 'Canlı' : 'Live') : liveStatus === 'offline' ? (tr ? 'Çevrimdışı' : 'Offline') : (tr ? 'Bağlanıyor' : 'Connecting');
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
    <header className="navbar" lang={language}>
      <div className="navbar-brand">
        <a className="navbar-brand-logo" href="https://matisse-kdt.eu/" target="_blank" rel="noopener noreferrer" title="MATISSE">
          <img src={LOGO_BASE + 'logo.svg'} alt="MATISSE" />
        </a>
        <span className="navbar-product">{tr ? 'İzleme Aracı' : 'Monitoring Tool'}</span>
      </div>

      <PartnerMarks className="navbar-partners" />

      <nav className="navbar-nav" aria-label={tr ? 'Ana gezinme' : 'Main'}>
        {NAV_LINKS.map((link) => (
          <a key={link.id} href={link.href} aria-current={page === link.id ? 'page' : undefined}>
            {link[language]}
          </a>
        ))}
      </nav>

      <div className="navbar-status">
        <span className="live-badge" data-status={liveStatus} role="status" aria-label={`${tr ? 'Telemetri' : 'Telemetry'}: ${statusLabel}`}>
          <span className="live-dot" aria-hidden="true" />
          <span className="live-label" aria-hidden="true">{statusLabel}</span>
        </span>
        <div className="navbar-language" role="group" aria-label="Language / Dil">
          <button type="button" lang="en" aria-label="English" aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>EN</button>
          <button type="button" lang="tr" aria-label="Türkçe" aria-pressed={language === 'tr'} onClick={() => setLanguage('tr')}>TR</button>
        </div>
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
        aria-label={menuOpen ? (tr ? 'Menüyü kapat' : 'Close menu') : (tr ? 'Menüyü aç' : 'Open menu')}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <MenuIcon open={menuOpen} />
      </button>

      {menuOpen && (
        <>
          <div className="navbar-backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" />
          <div id="navbar-menu" className="navbar-menu">
            <nav className="navbar-menu-nav" aria-label={tr ? 'Ana gezinme' : 'Main'}>
              {NAV_LINKS.map((link) => (
                <a key={link.id} href={link.href} aria-current={page === link.id ? 'page' : undefined}>
                  {link[language]}
                </a>
              ))}
            </nav>
            <div className="navbar-menu-section">
              <p className="navbar-menu-label">{tr ? 'Ortaklar' : 'Partners'}</p>
              <PartnerMarks className="navbar-menu-partners" />
            </div>
            <div className="navbar-menu-section">
              <p className="navbar-menu-label">{tr ? 'Yerel saat' : 'Local time'}</p>
              <LiveClock />
            </div>
          </div>
        </>
      )}
    </header>
  );
}
