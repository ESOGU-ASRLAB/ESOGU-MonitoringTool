import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export const LANGUAGE_STORAGE_KEY = 'matisse-language';
const LanguageContext = createContext(null);
const supportedLanguage = (value) => value === 'tr' ? 'tr' : 'en';

function readLanguage() {
  try { return supportedLanguage(localStorage.getItem(LANGUAGE_STORAGE_KEY)); }
  catch { return 'en'; }
}

// One preference for the navbar, chatbot, narration and scene labels. It is
// independent of tour settings and survives navigation between full pages.
export function LanguageProvider({ children }) {
  const [language, updateLanguage] = useState(readLanguage);
  const setLanguage = useCallback((value) => updateLanguage(supportedLanguage(value)), []);
  useEffect(() => {
    document.documentElement.lang = language;
    try { localStorage.setItem(LANGUAGE_STORAGE_KEY, language); } catch { /* Storage is optional. */ }
  }, [language]);
  useEffect(() => {
    const sync = (event) => {
      if (event.key === LANGUAGE_STORAGE_KEY || event.key === null) setLanguage(event.newValue);
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [setLanguage]);
  const value = useMemo(() => ({ language, setLanguage }), [language, setLanguage]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error('useLanguage must be used inside LanguageProvider');
  return value;
}
