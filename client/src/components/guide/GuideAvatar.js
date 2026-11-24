import React from 'react';

export default function GuideAvatar({ speaking = false, small = false }) {
  return <div className={`guide-avatar${speaking ? ' speaking' : ''}${small ? ' small' : ''}`} aria-hidden="true">
    <svg viewBox="0 0 48 48" fill="none">
      <rect x="1" y="1" width="46" height="46" rx="12" fill="#eaf1fd" stroke="#d2dff5" />
      <path d="M10 34V20l9 5v-8l10 6V12h6v22H10Z" stroke="#2060cd" strokeWidth="2" strokeLinejoin="round" />
      <path d="M15 29h2m6 0h2m6 0h2" stroke="#2060cd" strokeWidth="2" strokeLinecap="round" />
      <circle className="guide-avatar-ring" cx="37" cy="11" r="4" fill={speaking ? '#2060cd' : '#9ab4dc'} />
    </svg>
  </div>;
}
