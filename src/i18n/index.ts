import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import en from './en.json'
import zhCN from './zh-CN.json'

// Two locales today; extend by adding to `resources` and picking a key below.
export const SUPPORTED_LANGS = ['en', 'zh-CN'] as const
export type SupportedLang = (typeof SUPPORTED_LANGS)[number]

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      'zh-CN': { translation: zhCN },
    },
    fallbackLng: 'en',
    // Only load the user's actual language (avoid asking i18next to load 'zh'
    // when the user is on 'zh-CN' — we don't ship a 'zh' resource and the
    // load attempt was masking 'zh-CN' under load: 'all' default behavior).
    load: 'currentOnly',
    supportedLngs: SUPPORTED_LANGS as unknown as string[],
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'toolbox-lang',
      // Convert 'zh-Hans', 'zh-Hans-CN', 'zh-TW', etc. → 'zh-CN' (our only zh resource).
      // Convert any 'en-*' → 'en'.
      convertDetectedLanguage: (lng) => {
        if (lng.startsWith('zh')) return 'zh-CN'
        if (lng.startsWith('en')) return 'en'
        return lng
      },
    },
  })

// Keep <html lang="…"> in sync so screen readers / browsers pick the right language.
function syncHtmlLang(lang: string) {
  document.documentElement.setAttribute('lang', lang)
}
syncHtmlLang(i18n.resolvedLanguage ?? i18n.language)
i18n.on('languageChanged', syncHtmlLang)

export default i18n
