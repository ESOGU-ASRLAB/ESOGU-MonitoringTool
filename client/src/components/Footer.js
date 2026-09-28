import React from 'react';
import './Footer.css';

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="footer">
      <p className="footer-credit">
        <span>© {year}</span>
        <strong>MATISSE IFARLAB-EDIH</strong>
        <span className="footer-sep" aria-hidden="true" />
        <span>Doç. Dr. UĞUR YAYAN</span>
      </p>
    </footer>
  );
}
