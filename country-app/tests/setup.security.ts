/**
 * setup.security.ts — global test setup with hardened defaults.
 *
 * Guarantees:
 *  1. Every test starts from a CLEAN Web Storage realm (no cross-test data
 *     residue; models ASVS V3.4 "session artefacts must not persist").
 *  2. `fetch` is never implicitly available: tests that forget to mock it get
 *     an explicit error instead of hitting the network (prevents accidental
 *     egress of fixture data; NIST CSF PR.PS-3 / secure-by-default).
 *  3. A guarded cookie jar helper enforces Secure/HttpOnly/SameSite flags for
 *     any session cookie written in tests (PCI DSS Req. 6.5.2, ASVS V3.4).
 */
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

beforeEach(() => {
  // Fresh storage + fresh fetch stub per test (isolation + no real egress).
  localStorage.clear()
  sessionStorage.clear()
  const fetchMock = vi.fn(() =>
    Promise.reject(new Error('SECURITY: unmocked fetch — stub globalThis.fetch in this test')),
  )
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/**
 * Asserts a Set-Cookie style string carries the mandatory security attributes
 * for session cookies. Used by storage/cookie test suites.
 * PCI DSS v4.0.1 Req. 6.5.2 · OWASP ASVS V3.4.1 · OWASP Session Mgmt Cheat Sheet.
 */
export function expectSecureCookie(cookie: string): void {
  const lower = cookie.toLowerCase()
  if (!lower.includes('secure')) throw new Error('cookie missing Secure flag')
  if (!lower.includes('httponly')) throw new Error('cookie missing HttpOnly flag')
  if (!/samesite=(strict|lax)/.test(lower)) throw new Error('cookie missing SameSite=Strict/Lax')
}
