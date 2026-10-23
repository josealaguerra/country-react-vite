/**
 * xss-prevention.test.tsx — Input sanitisation & XSS prevention suite.
 *
 * Framework mapping (each describe block repeats this inline):
 *  - OWASP Top 10 2021 A03 "Injection" (Reflected + DOM-based XSS)
 *  - OWASP ASVS v4.0.3 V5.1 (input validation), V5.2 (output encoding/sanitisation),
 *    V5.3 (deserialisation-safe URL handling)
 *  - OWASP XSS Prevention Cheat Sheet rules #1 (encode output), #6 (sanitise
 *    HTML for active content), DOM-based XSS Prevention Cheat Sheet (sink guard)
 *  - OWASP Input Validation Cheat Sheet (allow-lists, length limits, fail closed)
 *  - NIST CSF 2.0 PR.PS-2 (platform hardened by secure defaults)
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Header from '../../src/components/Header.jsx'
import RichText from '../../src/components/RichText.jsx'
import {
  sanitizeSearchInput,
  validateResourceName,
  escapeHtml,
  toSafeHtml,
  sanitizeUrl,
  MAX_SEARCH_LENGTH,
} from '../../src/utils/security.js'

/* -------------------------------------------------------------------------- */
describe('sanitizeSearchInput — OWASP Input Validation Cheat Sheet / ASVS V5.1', () => {
  it('passes ordinary search terms through unchanged', () => {
    expect(sanitizeSearchInput('Germany')).toBe('Germany')
    expect(sanitizeSearchInput('  São Tomé  ')).toBe('São Tomé')
  })

  it('REJECTS <script> payloads instead of forwarding them (fail closed)', () => {
    // OWASP Top 10 A03: classic reflected-XSS probe must never reach state/network.
    expect(() => sanitizeSearchInput('<script>alert(1)</script>')).toThrow(TypeError)
    expect(() => sanitizeSearchInput('germany <SCRIPT >alert(document.cookie)</SCRIPT>')).toThrow()
  })

  it('REJECTS inline event-handler injection (`onerror=` style vectors)', () => {
    // DOM-based XSS Cheat Sheet: attribute-injection vectors are dropped early.
    expect(() => sanitizeSearchInput('<img src=x onerror=alert(1)>')).toThrow(TypeError)
    expect(() => sanitizeSearchInput('France onmouseover=fetch("//evil")')).toThrow(TypeError)
  })

  it('strips control characters and zero-width joiners used for filter evasion', () => {
    // Input Validation Cheat Sheet: normalise BEFORE validating.
    const evasive = 'ger\u200Bmany\u0000'
    expect(sanitizeSearchInput(evasive)).toBe('germany')
  })

  it('enforces a maximum length (memory-exhaustion / payload-smuggling guard)', () => {
    const huge = 'a'.repeat(MAX_SEARCH_LENGTH + 5_000)
    expect(sanitizeSearchInput(huge)).toHaveLength(MAX_SEARCH_LENGTH)
  })

  it('returns empty string for null/undefined/blank input (no "null" rendering bug)', () => {
    expect(sanitizeSearchInput(null)).toBe('')
    expect(sanitizeSearchInput(undefined)).toBe('')
    expect(sanitizeSearchInput('   ')).toBe('')
  })
})

/* -------------------------------------------------------------------------- */
describe('validateResourceName — API path-segment injection (ASVS V5.3, OWASP A03)', () => {
  it('accepts and percent-encodes legitimate names incl. accents & separators', () => {
    expect(validateResourceName("Côte d'Ivoire")).toBe(encodeURIComponent("Côte d'Ivoire"))
    expect(validateResourceName('Trinidad and Tobago')).toBe('Trinidad%20and%20Tobago')
  })

  it('blocks HTML/script metacharacters from ever entering a URL path', () => {
    expect(() => validateResourceName('<svg onload=alert(1)>')).toThrow(TypeError)
    expect(() => validateResourceName('../../etc/passwd')).toThrow(TypeError)
    expect(() => validateResourceName('Germany?callback=steal')).toThrow(TypeError)
  })

  it('blocks javascript:/blob: scheme smuggling (DOM-XSS sink `location`)', () => {
    expect(() => validateResourceName('javascript:alert(1)')).toThrow(TypeError)
    expect(() => validateResourceName('blob:https://evil/x')).toThrow(TypeError)
  })

  it('rejects oversized identifiers (DoS via huge query strings, OWASP A05 review)', () => {
    expect(() => validateResourceName('A'.repeat(500))).toThrow(RangeError)
  })
})

/* -------------------------------------------------------------------------- */
describe('escapeHtml / sanitizeUrl — output encoding (XSS Prevention Cheat Sheet #1)', () => {
  it('entity-encodes all HTML metacharacters for text contexts', () => {
    const dirty = `<script>alert("xss")</script> & 'quote'`
    const safe = escapeHtml(dirty)
    expect(safe).not.toContain('<script>')
    expect(safe).toContain('&lt;script&gt;')
    expect(safe).toContain('&quot;')
    expect(safe).toContain('&#x27;')
  })

  it('URL allow-list keeps https but kills javascript:/data: URIs (ASVS V5.3.3)', () => {
    expect(sanitizeUrl('https://google.com/maps')).toBe('https://maps.google.com/')
      .toMatch(/^https:/)
    expect(sanitizeUrl('javascript:alert(document.domain)')).toBe('')
    expect(sanitizeUrl('data:text/html;base64,PHNjcmlwdD4=')).toBe('')
    expect(sanitizeUrl('vbScript:msgbox(1)')).toBe('')
  })
})

/* -------------------------------------------------------------------------- */
describe('toSafeHtml + <RichText> — DOM sink protection (DOM-based XSS Cheat Sheet)', () => {
  it('DOMPurify strips script tags while KEEPING benign text content', () => {
    const out = toSafeHtml('<p>Hello <script>evil()</script>world</p>')
    expect(out).not.toContain('<script')
    expect(out).toContain('Hello')
    expect(out).toContain('world')
  })

  it('strips event-handler attributes from otherwise allowed tags', () => {
    const out = toSafeHtml('<b onclick="steal()">bold</b>')
    expect(out).not.toMatch(/onclick/i)
    expect(out).toBe('<b>bold</b>')
  })

  it('removes svg/onload mXSS-style payloads', () => {
    const out = toSafeHtml('<svg><animate onbegin=alert(1) attributeName=x dur=1s></svg>')
    expect(out).not.toMatch(/<svg|onbegin/i)
  })

  it('<RichText> renders sanitized markup into the DOM with ZERO live script nodes', () => {
    // End-to-end proof: even if the component uses innerHTML under the hood,
    // no executable element survives sanitisation (OWASP A03 regression gate).
    render(
      <RichText
        testId="rich"
        html={'<strong>Berlin</strong><script>window.__pwned=1</script><img src=x onerror="window.__pwned=1">'}
      />,
    )
    const node = screen.getByTestId('rich')
    expect(node).toHaveTextContent('Berlin')
    expect(node.querySelector('script')).toBeNull()
    expect(node.querySelector('img')).toBeNull()
    // @ts-expect-error asserting global was never set
    expect(window.__pwned).toBeUndefined()
  })

  it('React auto-escaping still neutralises raw JSX interpolation', () => {
    // Baseline guarantee we regression-test alongside manual sinks.
    const evil = '<script>bad()</script>'
    render(<div data-testid="plain">{evil}</div>)
    expect(screen.getByTestId('plain').textContent).toBe(evil) // shown as TEXT
    expect(document.querySelector('script[src], script:not([src])')).toBeNull()
  })
})

/* -------------------------------------------------------------------------- */
describe('<Header> search input — integration of sanitiser at the UI boundary', () => {
  it('typing an XSS probe updates state only with sanitized text', async () => {
    const user = userEvent.setup()
    let captured = ''
    const Controlled = () => {
      // Mirror App.jsx wiring: onChange feeds sanitizeSearchInput before setState.
      return (
        <Header
          search={captured}
          onSearchChange={(v) => {
            try {
              captured = sanitizeSearchInput(v)
            } catch {
              /* rejected → keep previous value (fail closed) */
            }
          }}
          darkMode={false}
          onToggleDark={() => {}}
        />
      )
    }
    render(<Controlled />)
    const input = screen.getByRole('searchbox', { name: /buscar país/i })

    await user.clear(input)
    await user.type(input, '<script>alert(1)</script>')
    // The injected markup must NOT have been accepted into app state.
    expect(captured).not.toContain('<script>')

    await user.clear(input)
    await user.type(input, 'Spain')
    expect(captured).toBe('Spain')
  })
})
