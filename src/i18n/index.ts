import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import pt from './pt-PT.json';
import en from './en.json';

export type Lang = 'pt-PT' | 'en';

const KEY = 'martime.lang';

export function storedLang(): Lang {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'en' || v === 'pt-PT') return v;
  } catch {
    // storage unavailable
  }
  return 'pt-PT';
}

export function rememberLang(l: Lang): void {
  try {
    localStorage.setItem(KEY, l);
  } catch {
    // storage unavailable
  }
}

void i18n.use(initReactI18next).init({
  resources: { 'pt-PT': { translation: pt }, en: { translation: en } },
  lng: storedLang(),
  fallbackLng: 'pt-PT',
  interpolation: { escapeValue: false },
  returnNull: false,
});

i18n.on('languageChanged', (l) => {
  document.documentElement.lang = l;
});

export default i18n;
