import React from 'react';
import { useLanguage } from '../LanguageContext';
import './SceneLoading.css';

export default function SceneLoading() {
  const { language } = useLanguage();
  return <div className="scene-loading" role="status" aria-live="polite">
    <span className="scene-loading-spinner" aria-hidden="true" />
    <span>{language === 'tr' ? '3B fabrika yükleniyor…' : 'Loading the 3D factory…'}</span>
  </div>;
}
