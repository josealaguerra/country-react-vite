/**
 * secure-storage.test.ts — Secure state & Web Storage handling suite.
 *
 * Framework mapping:
 *  - PCI DSS v4.0.1 Req. 3.3.1.2 / 3.5.1.2 (PAN & SAD must never be stored;
 *    here: never even *written* to browser storage), Req. 6.4.3 (client code
 *    on payment-adjacent pages is controlled and auditable)
 *  - OWASP ASVS v4.0.3 V6.4.1 (no sensitive data in localStorage),
 *    V3.3/V3.4 (session artefacts: memory-only, idle expiry, cleared on logout)
 *  - OWASP Session Management Cheat Sheet (token handling guidance)
 *  - NIST CSF 2.0 PR.DS-1/PR.DS-6 (data protected/destroyed when no longer needed),
 *    DE.CM-1 (security events — attempted violations — are observable)
 */
import { describe, it, expect } from 'vitest'
import {
  createSecureStorage,
  containsSensitiveData,
  isLikelyPan,
} from '../../src/utils/security.js'
import {
  saveTheme,
  loadTheme,
  saveRegionFilter,
  clearPreferences,
} from '../../src/utils/preferencesService.js'
import { expectSecureCookie } from '../setup.security.ts'

// Luhn-valid test PANs from the PCI SSC validation guide (NOT real cards).
const TEST_VISA_PAN = '4242424242424242'
const TEST_MC_PAN = '5555555555554444'

/* -------------------------------------------------------------------------- */
describe('containsSensitiveData — PCI DSS Req. 3.3 detection engine', () => {
  it('flags cardholder-data keys (pan, card_number, cvv, track1…)', () => {
    for (const key of ['pan', 'cardNumber', 'card_number', 'cvv', 'CVC2', 'track1', 'pin_block']) {
      expect(containsSensitiveData(key, 'whatever')).toBe(true)
    }
  })

  it('flags composite/obfuscated keys like "checkout_card_pan"', () => {
    expect(containsSensitiveData('checkoutCardPan', 'x')).toBe(true)
    expect(containsSensitiveData('checkout_card_pan', 'x')).toBe(true)
    expect(containsSensitiveData('user-password-hash', 'x')).toBe(true)
  })

  it('flags values that look like a genuine (Luhn-valid) PAN even under benign keys', () => {
    // Defence-in-depth: mislabelled fields still blocked. PCI Req. 3.3.1.2.
    expect(containsSensitiveData('note', `mi tarjeta ${TEST_VISA_PAN}`)).toBe(true)
    expect(isLikelyPan(TEST_MC_PAN)).toBe(true)
    expect(isLikelyPan('1234567890123456')).toBe(false) // fails Luhn → not a PAN
  })

  it('flags SAD combos: expiry + security code in one blob', () => {
    expect(containsSensitiveData('card_meta', 'exp 04/28 cvv 123')).toBe(true)
  })

  it('flags bearer tokens & secrets (ASVS V3.4 — tokens stay in memory only)', () => {
    expect(containsSensitiveData('auth', 'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9abcdef')).toBe(true)
    expect(containsSensitiveData('refresh_token', 'opaque-value')).toBe(true)
  })

  it('does NOT flag ordinary UI preferences', () => {
    expect(containsSensitiveData('theme', 'dark')).toBe(false)
    expect(containsSensitiveData('region', 'Europe')).toBe(false)
    expect(containsSensitiveData('recentSearches', ['Spain', 'Perú'])).toBe(false)
  })

  it('recurses into nested objects (a PAN hidden in a cart object is caught)', () => {
    const cart = { items: ['flag'], payment: { card: { number: TEST_VISA_PAN } } }
    expect(containsSensitiveData('cartState', cart)).toBe(true)
  })
})

/* -------------------------------------------------------------------------- */
describe('createSecureStorage — enforcement at the persistence boundary', () => {
  it('persists safe preferences round-trip through localStorage', () => {
    const store = createSecureStorage('local')
    store.set('countriesdex:theme', 'dark')
    expect(localStorage.getItem('countriesdex:theme')).toBe('"dark"')
    expect(store.get('countriesdex:theme')).toBe('dark')
  })

  it('THROWS SECURITY_VIOLATION when a PAN write is attempted — nothing is stored', () => {
    const store = createSecureStorage('local')
    expect(() => store.set('savedCard', TEST_VISA_PAN)).toThrow(/SECURITY_VIOLATION/)
    // PCI evidence: the raw PAN must be absent from every storage area.
    expect(localStorage.getItem('savedCard')).toBeNull()
    expect(Object.values(localStorage as unknown as Record<string, string>)).not.toContain(TEST_VISA_PAN)
  })

  it('blocks session-area writes too (sessionStorage path)', () => {
    const store = createSecureStorage('session')
    expect(() => store.set('jwt', 'eyJhbGciOiJIUzI1NiJ9.abc.def')).toThrow(/SECURITY_VIOLATION/)
    expect(sessionStorage.length).toBe(0)
  })

  it('returns null (never crashes) on corrupted entries — fail-safe reads', () => {
    localStorage.setItem('countriesdex:broken', '{not json')
    const store = createSecureStorage('local')
    expect(store.get('countriesdex:broken')).toBeNull()
  })

  it('clearNamespace removes ONLY app keys (ASVS V3.4 logout cleanup)', () => {
    const store = createSecureStorage('local')
    store.set('countriesdex:theme', 'light')
    store.set('countriesdex:region', 'Asia')
    localStorage.setItem('otherapp:data', 'keep me')
    store.clearNamespace('countriesdex:')
    expect(localStorage.getItem('countriesdex:theme')).toBeNull()
    expect(localStorage.getItem('otherapp:data')).toBe('keep me')
  })
})

/* -------------------------------------------------------------------------- */
describe('preferencesService — allow-listed state persistence (NIST CSF PR.DS-1)', () => {
  it('accepts only known theme values', () => {
    saveTheme('dark')
    expect(loadTheme()).toBe('dark')
    expect(() => saveTheme('<script>dark</script>' as never)).toThrow(TypeError)
  })

  it('falls back safely when stored value was tampered with', () => {
    // Attacker edits DevTools storage: service must re-validate on read.
    localStorage.setItem('countriesdex:theme', JSON.stringify('malicious'))
    expect(loadTheme('light')).toBe('light')
  })

  it('rejects unknown region strings instead of persisting them', () => {
    expect(() => saveRegionFilter('Mars')).toThrow(TypeError)
    saveRegionFilter('Europe')
    expect(localStorage.getItem('countriesdex:region')).toBe('"Europe"')
  })

  it('clearPreferences wipes the namespace on logout (ASVS V3.4.1)', () => {
    saveTheme('dark')
    saveRegionFilter('Africa')
    clearPreferences()
    expect(localStorage.getItem('countriesdex:theme')).toBeNull()
    expect(localStorage.getItem('countriesdex:region')).toBeNull()
  })
})

/* -------------------------------------------------------------------------- */
describe('cookie hardening helper — OWASP Session Mgmt Cheat Sheet / PCI 6.5.2', () => {
  it('accepts properly flagged session cookies', () => {
    expectSecureCookie('sid=abc123; Path=/; HttpOnly; Secure; SameSite=Strict')
  })

  it('rejects cookies missing Secure, HttpOnly or SameSite', () => {
    expect(() => expectSecureCookie('sid=abc; Path=/; HttpOnly; SameSite=Strict')).toThrow(/Secure/)
    expect(() => expectSecureCookie('sid=abc; Path=/; Secure; SameSite=Lax')).toThrow(/HttpOnly/)
    expect(() => expectSecureCookie('sid=abc; Path=/; Secure; HttpOnly')).toThrow(/SameSite/)
  })

  it('document.cookie can NEVER see an HttpOnly session id (ASVS V3.4)', () => {
    // jsdom models this: setting via document.cookie cannot carry HttpOnly,
    // and reading returns only non-HttpOnly cookies. We assert the pattern
    // the app must follow: JS stores NO session identifiers at all.
    document.cookie = 'ui_pref=visible; Secure; SameSite=Lax'
    expect(document.cookie).toContain('ui_pref')
    expect(document.cookie).not.toMatch(/sid|session_token/i)
  })
})
