/**
 * api-error-handling.test.tsx — API response & error-handling security suite.
 *
 * Framework mapping:
 *  - OWASP ASVS v4.0.3 V7.4 (error handling must not leak internals),
 *    V9.1 (no information disclosure via error messages / stack traces),
 *    V5.1.2 (deserialise only expected structures; reject malformed JSON)
 *  - OWASP Top 10 A05 Security Misconfiguration (verbose errors),
 *    A01 Broken Access Control (proxy must not echo credentials on failure)
 *  - NIST CSF PR.DS-5 (data-leak prevention), DE.CM (anomalous responses observable)
 *  - PCI DSS v4.0.1 Req. 6.5.1/6.5.2 (public apps must not disclose data that
 *    helps an attacker, e.g. debug traces, keys, internal paths)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import App from '../../src/App.jsx'
import { fetchAllCountries, searchCountriesByName } from '../../src/api/countriesApi.js'
import { toSafeUserError, GENERIC_ERROR_MESSAGE, ErrorBoundary } from '../../src/components/ErrorBoundary.jsx'

/** Helper: stub fetch with a raw Response-like object. */
function mockFetch(status: number, body: unknown, opts: { jsonThrows?: boolean } = {}) {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: 'HTTP status text',
    json: () => (opts.jsonThrows ? Promise.reject(new SyntaxError('Unexpected token <')) : Promise.resolve(body)),
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

beforeEach(() => {
  // setup file already clears storage + installs a rejecting fetch stub.
})

/* -------------------------------------------------------------------------- */
describe('countriesApi — malformed/unexpected responses (ASVS V5.1.2)', () => {
  it('turns non-JSON responses into a generic parse error WITHOUT echoing the body', async () => {
    // Attacker-controlled HTML served as "JSON" must never be re-rendered.
    mockFetch(200, null, { jsonThrows: true })
    await expect(fetchAllCountries()).rejects.toThrow(/respuesta no válida/i)
  })

  it('treats a missing array payload as empty list instead of crashing (fail safe)', async () => {
    mockFetch(200, { success: true, data: null })
    await expect(fetchAllCountries()).resolves.toEqual([])
  })

  it('surfaces envelope errors but marks 404s as notFound (no raw upstream dump)', async () => {
    mockFetch(404, { success: false, errors: [{ message: 'Country not found' }] })
    await expect(searchCountriesByName('zzz')).resolves.toEqual([])
  })

  it('NEVER forwards an API key that a misconfigured proxy echoed back', async () => {
    // Scenario: broken backend leaks `Authorization` in its error body.
    mockFetch(500, {
      success: false,
      errors: [{ message: 'upstream rejected Authorization: Bearer sk-live-LEAKEDKEY1234567890' }],
    })
    const err = await fetchAllCountries().then(
      () => null,
      (error: Error) => error,
    )
    // The message may exist internally…
    expect(err?.message).toMatch(/Authorization/)
    // …but the SAFE projection shown to users must scrub it entirely.
    const safe = toSafeUserError(err)
    expect(safe.message).toBe(GENERIC_ERROR_MESSAGE)
    expect(safe.message).not.toMatch(/sk-live|Bearer|Authorization/i)
  })
})

/* -------------------------------------------------------------------------- */
describe('toSafeUserError — information-disclosure scrubbing (ASVS V7.4/V9.1)', () => {
  it('genericises any message containing secret-looking fragments', () => {
    const cases = [
      new Error('failed: api_key=abc123xyz'),
      new Error('password reset token invalid'),
      new Error('BEGIN RSA PRIVATE KEY-----'),
      new Error('missing header authorization for request'),
    ]
    for (const err of cases) {
      expect(toSafeUserError(err).message).toBe(GENERIC_ERROR_MESSAGE)
    }
  })

  it('strips stack-trace frames and absolute container paths from display', () => {
    const err = new Error("TypeError: x is undefined\n    at App (/app/server/routes/index.js:12:3)")
    const safe = toSafeUserError(err)
    expect(safe.message).not.toMatch(/at App/)
    expect(safe.message).not.toContain('/app/')
  })

  it('always hides detail on 5xx statuses regardless of message content', () => {
    const err = Object.assign(new Error('database timeout on replica db-03.internal'), { status: 503 })
    expect(toSafeUserError(err).message).toBe(GENERIC_ERROR_MESSAGE)
  })

  it('keeps safe 4xx validation messages so UX stays helpful', () => {
    const err = Object.assign(new Error('País no encontrado'), { status: 404 })
    expect(toSafeUserError(err).message).toBe('País no encontrado')
  })

  it('passes through only well-formed correlation ids (regex-guarded)', () => {
    const ok = toSafeUserError(Object.assign(new Error('oops'), { requestId: 'req-1a2b3c4d' }))
    expect(ok.requestId).toBe('req-1a2b3c4d')
    const evil = toSafeUserError(
      Object.assign(new Error('oops'), { requestId: '<script>trace</script>' }),
    )
    expect(evil.requestId).toBeUndefined()
  })
})

/* -------------------------------------------------------------------------- */
describe('<App> integration — network failures show NO sensitive internals', () => {
  it('renders a user-safe banner when the proxy returns a leaked-key 500', async () => {
    mockFetch(500, {
      success: false,
      errors: [{ message: 'internal auth failure for api_key=SECRET_DO_NOT_SHOW' }],
    })
    render(<App />)
    // Whatever container appears, the secret must be absent from the DOM.
    await waitFor(() => {
      expect(document.body.textContent).not.toMatch(/SECRET_DO_NOT_SHOW|api_key/i)
    })
  })

  it('renders safely when fetch itself rejects (network down)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    )
    render(<App />)
    await waitFor(() => {
      expect(document.body.textContent).toContain('Verifica tu conexión')
    })
    expect(document.body.innerHTML).not.toMatch(/stack|traceback|at\s+\w+\.\w+/i)
  })
})

/* -------------------------------------------------------------------------- */
describe('<ErrorBoundary> — render-time crash containment (ASVS V7.4.1)', () => {
  const Bomb = ({ boom }: { boom?: boolean }) => {
    if (boom) throw new Error('Cannot read props of undefined at /var/app/secrets.json')
    return <p data-testid="ok">funciona</p>
  }

  it('shows a generic alert and a Ref id, never the real message or stack', () => {
    // Silence React's own console noise for this intentional crash test.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary>
        <Bomb boom />
      </ErrorBoundary>,
    )
    const alert = screen.getByTestId('error-boundary-message')
    expect(alert).toBeInTheDocument()
    expect(alert.textContent).toContain('Ref:')
    expect(alert.textContent).not.toMatch(/Cannot read|secrets\.json|\/var\/app|at /)
    spy.mockRestore()
  })

  it('renders children normally when nothing throws', () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    )
    expect(screen.getByTestId('ok')).toHaveTextContent('funciona')
  })
})
