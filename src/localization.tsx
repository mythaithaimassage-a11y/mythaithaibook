import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { dashboardThai } from './dashboard-th';
import { componentThai } from './components-th';

export type Language = 'en' | 'th';
export type TranslationMessage = { text: string; values: Values };
type Values = Record<string, string | number | TranslationMessage>;
const thai = { ...componentThai, ...dashboardThai };
// API notices may already contain interpolated identifiers and amounts.
const templates = Object.entries(thai).flatMap(([source, translated]) => {
  const placeholders = [...source.matchAll(/\{(\w+)\}/g)];
  if (!placeholders.length || !/[A-Za-z]{3}/.test(source.replace(/\{\w+\}/g, ''))) return [];
  let pattern = '^';
  let offset = 0;
  for (const placeholder of placeholders) {
    pattern += source.slice(offset, placeholder.index).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([\\s\\S]*?)';
    offset = placeholder.index! + placeholder[0].length;
  }
  pattern += source.slice(offset).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$';
  return [{ pattern: new RegExp(pattern), translated, keys: placeholders.map((item) => item[1]) }];
});

export function message(text: string, values: Values = {}): TranslationMessage {
  return { text, values };
}

export function translateText(input: string | TranslationMessage, language: Language, values: Values = {}): string {
  if (typeof input !== 'string') return translateText(input.text, language, input.values);
  const text = input;
  let translated = language === 'th' && Object.prototype.hasOwnProperty.call(thai, text) ? thai[text] : text;
  if (language === 'th' && translated === text && !Object.keys(values).length) {
    for (const template of templates) {
      const match = template.pattern.exec(text);
      if (!match) continue;
      translated = template.translated;
      values = Object.fromEntries(template.keys.map((key, index) => [key, match[index + 1]]));
      break;
    }
  }
  return translated.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key)
      ? typeof values[key] === 'object' ? translateText(values[key], language) : String(values[key])
      : match);
}

export function createTranslator(language: Language) {
  return (text: string | TranslationMessage, values?: Values) => translateText(text, language, values);
}

export function localizeTimeLabel(value: string | null | undefined, language: Language): string {
  const text = value ?? '';
  if (language !== 'th') return text;
  return text.replace(/\b(\d{1,2}):(\d{2})\s*(AM|PM)\b/gi, (match, hour: string, minute: string, period: string) => {
    const numericHour = Number(hour);
    if (numericHour < 1 || numericHour > 12 || Number(minute) > 59) return match;
    const converted = numericHour % 12 + (period.toUpperCase() === 'PM' ? 12 : 0);
    return `${String(converted).padStart(2, '0')}:${minute} น.`;
  });
}

const LanguageContext = createContext<Language>('en');

export function LanguageProvider({ language, children }: { language: Language; children: ReactNode }) {
  return <LanguageContext.Provider value={language}>{children}</LanguageContext.Provider>;
}

export function useTranslation() {
  const language = useContext(LanguageContext);
  return useMemo(() => ({
    language,
    locale: language === 'th' ? 'th-TH' : 'en-CA',
    translate: createTranslator(language),
    formatTime: (value: string | null | undefined) => localizeTimeLabel(value, language),
  }), [language]);
}
