import { createSecureStorage } from '../utils/security.js'

/**
 * preferencesService — persists ONLY non-sensitive UI preferences
 * (theme, region filter) through the PCI-aware `createSecureStorage` wrapper.
 *
 * Security mapping:
 *  - OWASP ASVS V6.4.1: stateful browser storage must not contain sensitive data.
 *  - PCI DSS v4.0.1 Req. 3.3.1.2 / 3.4.1.2: PAN + SAD never persisted client-side.
 *  - NIST CSF PR.DS-1: data-at-rest protected by design (allow-listed keys only).
 */
const STORAGE_NS = 'countriesdex:'
const storage = createSecureStorage('local')

const VALID_THEMES = Object.freeze(['light', 'dark'])

export function saveTheme(theme) {
  if (!VALID_THEMES.includes(theme)) {
    throw new TypeError(`saveTheme: "${theme}" is not an allowed value`)
  }
  storage.set(`${STORAGE_NS}theme`, theme)
}

export function loadTheme(fallback = 'light') {
  const stored = storage.get(`${STORAGE_NS}theme`)
  return VALID_THEMES.includes(stored) ? stored : fallback
}

export function saveRegionFilter(region) {
  // Allow-list of known regions; anything else is rejected (ASVS V5.1).
  const allowed = ['All', 'Africa', 'Americas', 'Asia', 'Europe', 'Oceania', 'Antarctic']
  if (!allowed.includes(region)) {
    throw new TypeError(`saveRegionFilter: unexpected region "${region}"`)
  }
  storage.set(`${STORAGE_NS}region`, region)
}

export function loadRegionFilter() {
  return storage.get(`${STORAGE_NS}region`) ?? 'All'
}

/** Logout-style cleanup: remove every namespaced key (NIST CSF PR.IP / ASVS V3.4). */
export function clearPreferences() {
  storage.clearNamespace(STORAGE_NS)
}
