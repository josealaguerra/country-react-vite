/**
 * security.js — Shared client-side security primitives for CountriesDex.
 *
 * Compliance mapping:
 *  - OWASP Top 10 (2021):      A03 Injection (XSS), A04 Insecure Design (fail-closed validation)
 *  - OWASP ASVS v4.0.3:        V5.1 verify input against allow-lists, V5.2 encode/sanitise output,
 *                              V6.4 no sensitive data in Web Storage, V3.3 idle session expiry
 *  - OWASP Cheat Sheet Series: XSS Prevention (#1 output encoding), DOM-based XSS Prevention
 *                              (never feed untrusted strings to innerHTML sinks),
 *                              Input Validation (allow-lists + length caps, fail closed)
 *  - NIST CSF 2.0:             PR.DS (data security — protect stored/processed data),
 *                              PR.PS (platform security — secure defaults & config),
 *                              DE.CM (continuous monitoring of security events)
 *  - PCI DSS v4.0.1:           Req. 3.3 (never store PAN/SAD on the client),
 *                              Req. 6.4.3 (only authorised scripts run on payment pages),
 *                              Req. 6.5.1-6.5.2 (protective headers/CSP on public sites)
 */

import DOMPurify from 'dompurify'

/* -------------------------------------------------------------------------- */
/*                            Input validation                                */
/* -------------------------------------------------------------------------- */

/**
 * Hard upper bound for any free-text search term accepted by the UI.
 * OWASP Input Validation Cheat Sheet: inputs must have maximum lengths so a
 * malicious actor cannot exhaust memory or smuggle oversized payloads.
 */
export const MAX_SEARCH_LENGTH = 100

const SCRIPT_TAG_RE = /<\s*\/?\s*script\b/i
const EVENT_HANDLER_RE = /\son[a-z]+\s*=/i
const JS_URL_RE = /^\s*(?:javascript|vbscript|file|blob):/i

/**
 * Allow-list pattern for country names forwarded into API path segments:
 * letters (any script incl. accented), digits, spaces and a few separators.
 * Anything else (angle brackets, quotes, colons, backslashes…) is rejected —
 * an allow-list per ASVS V5.1, not a deny-list of "known bad" characters.
 */
const SAFE_NAME_RE = /^[\p{L}\p{M}\p{N} .,'()&/-]+$/u

/**
 * Validates + normalises a user-supplied search term before it reaches state,
 * storage, or the network layer.
 *
 * @param {unknown} raw value coming straight from an <input> event
 * @returns {string} trimmed, length-capped, control-char-free text ('' if unusable)
 * @throws {TypeError} when the input contains markup/script fragments that a
 *         naive pipeline would forward (defence-in-depth; the UI itself still
 *         renders via React's automatic output escaping).
 */
export function sanitizeSearchInput(raw) {
  if (raw == null) return ''
  if (typeof raw !== 'string') {
    throw new TypeError('sanitizeSearchInput expects a string')
  }

  // Strip C0/C1 control characters & zero-width joiners used in
  // filter-evasion tricks (OWASP XSS Prevention §DOM-based injection vectors).
  // eslint-disable-next-line no-control-regex
  const stripped = raw.replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, '')

  const trimmed = stripped.trim()
  if (trimmed.length === 0) return ''

  // Fail closed on anything that looks like script injection instead of
  // silently forwarding it into the query pipeline (ASVS V5.1.4).
  if (SCRIPT_TAG_RE.test(trimmed) || EVENT_HANDLER_RE.test(trimmed)) {
    throw new TypeError('Input rejected: potential script injection detected')
  }

  // Enforce the maximum-length constraint (truncate rather than reject so the
  // UX degrades safely — Insufficient Input Validation, OWASP Top 10 A03).
  return trimmed.slice(0, MAX_SEARCH_LENGTH)
}

/**
 * Validates a resource identifier (e.g. a country name) that will be embedded
 * in an API URL path segment. Rejects protocol-scheme smuggling
 * (`javascript:`), traversal and HTML metacharacters.
 *
 * @param {unknown} value
 * @returns {string} percent-encoded, safe path segment
 */
export function validateResourceName(value) {
  if (typeof value !== 'string') {
    throw new TypeError('validateResourceName expects a string')
  }
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_SEARCH_LENGTH) {
    throw new RangeError('Resource name rejected: empty or too long')
  }
  if (!SAFE_NAME_RE.test(trimmed)) {
    throw new TypeError('Resource name rejected: disallowed characters')
  }
  if (trimmed.split('/').some((segment) => segment === '.' || segment === '..')) {
    throw new TypeError('Resource name rejected: path traversal')
  }
  if (JS_URL_RE.test(trimmed)) {
    throw new TypeError('Resource name rejected: dangerous URL scheme')
  }
  return encodeURIComponent(trimmed)
}

/* -------------------------------------------------------------------------- */
/*                         Output encoding / sanitisation                     */
/* -------------------------------------------------------------------------- */

/**
 * Entity-encodes a string for placement in an HTML TEXT context.
 * Mirrors the escaping React performs automatically; use this whenever you
 * build HTML strings by hand (templates, clipboard writes, e-mails…).
 * OWASP XSS Prevention Cheat Sheet rule #1: "Encode data coming from
 * untrusted HTTP requests".
 *
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
  if (value == null) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
}

/**
 * DOMPurify configuration: allow-list of inert formatting tags only.
 * No `<script>`, no event attributes, no data- attributes. ASVS V5.2.3
 * ("sanitize HTML using a vetted library").
 */
export const SANITIZE_OPTIONS = Object.freeze({
  ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'span'],
  ALLOWED_ATTR: ['href', 'title'],
  ALLOW_DATA_ATTR: false,
  KEEP_CONTENT: true,
  RETURN_TRUSTED_TYPE: false,
})

/**
 * Trusted-types-style sink guard. If a Trusted Types policy exists (browsers
 * enforcing CSP `require-trusted-types-for`), respect it; otherwise fall back
 * to DOMPurify sanitisation so `innerHTML` sinks can never receive raw
 * untrusted markup (DOM-based XSS Prevention Cheat Sheet).
 *
 * @param {unknown} dirty HTML fragment from an untrusted source (API field, CMS…)
 * @returns {TrustedHTML|string} safe value suitable for an innerHTML sink
 */
export function toSafeHtml(dirty) {
  const plain = dirty == null ? '' : String(dirty)
  const tt = typeof window !== 'undefined' ? window.trustedTypes : undefined
  if (tt && typeof tt.createPolicy === 'function') {
    // One shared, audited policy name — grep-friendly for Semgrep rules.
    const policy = tt.createPolicy('countriesdex-html', {
      createHTML: (input) => DOMPurify.sanitize(input, SANITIZE_OPTIONS),
    })
    return policy.createHTML(plain)
  }
  return DOMPurify.sanitize(plain, SANITIZE_OPTIONS)
}

/**
 * Forces outbound links supplied by third-party data (REST Countries maps,
 * border links, user content) onto an http(s)-only allow-list. Blocks
 * `javascript:`/`data:` URIs. OWASP Unvalidated Redirects + DOM-XSS sinks
 * (`a.href`).
 *
 * @param {unknown} url
 * @returns {string} sanitised URL or '' when the URL is unsafe
 */
export function sanitizeUrl(url) {
  if (typeof url !== 'string') return ''
  const candidate = url.trim()
  if (candidate.length === 0) return ''
  if (JS_URL_RE.test(candidate)) return ''
  try {
    const parsed = new URL(candidate, window.location.origin)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return ''
    return parsed.toString()
  } catch {
    return ''
  }
}

/* -------------------------------------------------------------------------- */
/*                     Secure Web Storage wrapper (PCI DSS)                   */
/* -------------------------------------------------------------------------- */

/**
 * Key names that identify cardholder data / sensitive authentication data /
 * bearer credentials. PCI DSS v4.0.1 Req. 3.3 & 3.4: PAN, expiry, CVV/CVC,
 * track data, PIN blocks must NEVER be persisted on the client.
 * ASVS V6.4: no secrets in localStorage/sessionStorage.
 */
const SENSITIVE_KEY_RE =
  /(^|_)(pan|cardnumber|card_number|cvv|cvc|cvc2|cvv2|cid|track1|track2|pinblock|pin_block|password|passwd|secret|authorization|apikey|api_key|access_token|refreshtoken|refresh_token|sessiontoken|session_token|jwt|ssn|social_security)(_|$)/i

/** Expiry date like 12/28 printed next to a security-code mention. */
const EXP_DATE_RE = /\b(0[1-9]|1[0-2])\s?\/\s?(\d{2}|\d{4})\b/
const SECURITY_CODE_RE = /\b(?:cvv|cvc|cid)\b/i
/** Bearer tokens must live in memory only (ASVS V3.4 anti-pattern check). */
const BEARER_RE = /^Bearer\s+[A-Za-z0-9\-._~+/]{20,}=*$/i

/**
 * Returns true when a key/value pair looks like cardholder data, sensitive
 * authentication data, or a bearer token that must not live in Web Storage.
 *
 * @param {string} key
 * @param {unknown} value
 * @returns {boolean}
 */
export function containsSensitiveData(key, value) {
  if (typeof key !== 'string') return true // fail closed on weird keys
  const normalizedKey = key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  if (SENSITIVE_KEY_RE.test(`_${normalizedKey}_`)) return true

  if (typeof value === 'string') {
    if (isLikelyPan(value)) return true
    if (EXP_DATE_RE.test(value) && SECURITY_CODE_RE.test(value)) return true
    if (BEARER_RE.test(value.trim())) return true
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).some(([k, v]) => containsSensitiveData(k, v))
  }
  return false
}

/** Luhn checksum used by PCI guidance to recognise genuine-looking PANs. */
export function isLikelyPan(value) {
  const digits = String(value).replace(/[^\d]/g, '')
  if (digits.length < 13 || digits.length > 19) return false
  let sum = 0
  let double = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i])
    if (double) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
    double = !double
  }
  return sum % 10 === 0
}

/**
 * Namespaced, non-sensitive preference storage. Any attempt to persist
 * cardholder data, secrets or bearer tokens throws, so both tests and runtime
 * logs surface the violation. NIST CSF PR.DS-1 / PR.PS-2,
 * PCI DSS v4.0.1 Req. 3.3.1.2.
 *
 * @param {'local'|'session'} area which Web Storage backing to use
 */
export function createSecureStorage(area = 'local') {
  const backing = area === 'session' ? sessionStorage : localStorage
  return {
    set(key, value) {
      if (containsSensitiveData(key, value)) {
        throw new Error(
          `SECURITY_VIOLATION: refusing to persist sensitive data under key "${key}"`,
        )
      }
      backing.setItem(key, JSON.stringify(value))
    },
    get(key) {
      const raw = backing.getItem(key)
      if (raw == null) return null
      try {
        return JSON.parse(raw)
      } catch {
        // Corrupted/quota-poisoned entries are dropped, never rendered raw.
        return null
      }
    },
    remove(key) {
      backing.removeItem(key)
    },
    /** Wipe only our namespace — never nuke unrelated app data. */
    clearNamespace(prefix) {
      const doomed = []
      for (let i = 0; i < backing.length; i++) {
        const k = backing.key(i)
        if (k && k.startsWith(prefix)) doomed.push(k)
      }
      doomed.forEach((k) => backing.removeItem(k))
    },
  }
}

/** Session idleness watchdog (ASVS V3.3): expire UI sessions after inactivity. */
export const IDLE_TIMEOUT_MS = 15 * 60 * 1000
