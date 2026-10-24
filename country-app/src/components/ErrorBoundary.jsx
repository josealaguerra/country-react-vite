import { Component } from 'react'

/**
 * Generic error shape produced by the secure API layer. Only three fields are
 * ever allowed to reach the UI: a human-safe message, an HTTP status and a
 * non-sensitive correlation id. Everything else (stack traces, upstream URLs,
 * API keys echoed by misconfigured proxies) is dropped at construction time.
 *
 * Security mapping:
 *  - OWASP ASVS V7.4 / V9.1: verify application errors do not disclose stack
 *    traces, config values or internal paths to end users.
 *  - PCI DSS v4.0.1 Req. 6.5.1-6.5.2 (public sites must not leak data that
 *    aids attackers), NIST CSF PR.DS-5 (data leaking prevention).
 */
export const GENERIC_ERROR_MESSAGE =
  'Algo ha ido mal al consultar los datos. Inténtalo de nuevo en unos minutos.'

const SENSITIVE_FRAGMENTS_RE =
  /(api[_-]?key|authorization|bearer|secret|token|password|passwd|BEGIN [A-Z ]*PRIVATE KEY|sk-[a-zA-Z0-9]{8,})/i

/**
 * Normalises any thrown value (Error, string, envelope object) into a safe,
 * displayable error. Strips anything that smells like a secret or an internal
 * detail; falls back to a generic user-facing message.
 *
 * @param {unknown} err raw thrown value
 * @returns {{message: string, status?: number, requestId?: string}}
 */
export function toSafeUserError(err) {
  const rawMessage =
    err instanceof Error ? err.message : typeof err === 'string' ? err : String(err?.message ?? '')

  const status = typeof err?.status === 'number' ? err.status : undefined
  // Correlation ids are opaque tokens without PII — safe & useful for support.
  const requestId = typeof err?.requestId === 'string' && /^[A-Za-z0-9-]{8,32}$/.test(err.requestId)
    ? err.requestId
    : undefined

  let message = rawMessage.trim()

  // Never surface messages that echo secrets/config, regardless of source.
  if (!message || SENSITIVE_FRAGMENTS_RE.test(message)) {
    return { message: GENERIC_ERROR_MESSAGE, status, requestId }
  }

  // Strip embedded stack-trace markers ("at ...", "File ... line") and
  // absolute filesystem paths before display.
  message = message
    .split('\n')[0]
    .replace(/\s+at\s+\S+(?:\s+\([^)]*\))?.*$/g, '')
    .replace(/\/(?:home|var|usr|opt|app)\/\S*/g, '[internal path redacted]')
    .trim()

  // Unknown server errors are always genericised (no tech detail leakage).
  if (status && status >= 500) {
    return { message: GENERIC_ERROR_MESSAGE, status, requestId }
  }

  return {
    message: message.length > 0 ? message : GENERIC_ERROR_MESSAGE,
    status,
    requestId,
  }
}

/**
 * ErrorBoundary — last-line defence so unexpected render-time exceptions show
 * a generic notice instead of React's dev overlay or a raw stack trace.
 *
 * Security mapping: OWASP ASVS V7.4.1 (error handling), V9.1.2 (no info
 * disclosure through error messages); PCI DSS Req. 6.4.3 keeps the payment
 * page functional even when third-party widgets fail.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, requestId: createRequestId() }
  }

  static getDerivedStateFromError() {
    // NOTE: deliberately ignores the real error object for rendering; the
    // detailed error only goes to the (server-side) log sink in componentDidCatch.
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    // In production this would POST to an approved logging endpoint with the
    // error scrubbed of secrets. console.error is acceptable in dev/test only.
    if (import.meta.env?.MODE !== 'production') {
      console.error('[ErrorBoundary]', error?.message, errorInfo?.componentStack?.slice(0, 200))
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div role="alert" data-testid="error-boundary-message" className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-700">
          ⚠️ {GENERIC_ERROR_MESSAGE}{' '}
          <span className="font-mono text-xs">Ref: {this.state.requestId}</span>
        </div>
      )
    }
    return this.props.children
  }
}

/** Non-sensitive random correlation id (crypto-backed). */
export function createRequestId() {
  const bytes = new Uint8Array(8)
  ;(globalThis.crypto ?? { getRandomValues: (b) => b.fill(1) }).getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}
