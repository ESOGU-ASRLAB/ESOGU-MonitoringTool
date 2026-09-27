import React, { useState } from 'react';
import './App.css';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import DigitalTwin from './pages/DigitalTwin';
import Documentation from './pages/Documentation';

// Two pages, chosen by path: the technical guide at /docs, the twin otherwise.
const isDocs = () => /^\/docs\/?$/.test(window.location.pathname);

export default function App() {
  // Lifted out of DigitalTwin so the live-status badge can render in the
  // Navbar (one header row instead of two) while DigitalTwin's SSE effect
  // keeps driving it exactly as before, just through the passed-in setter.
  const [liveStatus, setLiveStatus] = useState('connecting'); // 'connecting' | 'live' | 'offline'

  return (
    <div className="app-shell">
      <Navbar liveStatus={liveStatus} />
      <main className="app-main">
        {isDocs() ? <Documentation /> : <DigitalTwin setLiveStatus={setLiveStatus} />}
      </main>
      <Footer />
    </div>
  );
}
