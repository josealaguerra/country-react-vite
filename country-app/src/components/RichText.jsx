import { useMemo } from 'react'
import { toSafeHtml, escapeHtml } from '../utils/security.js'

/**
 * RichText — renders third-party HTML fragments (e.g. a country "description"
 * field that may later come from a CMS) ONLY after DOMPurify sanitisation /
 * Trusted Types wrapping.
 *
 * Security mapping:
 *  - OWASP Top 10 A03 Injection (Stored/DOM XSS)
 *  - OWASP ASVS V5.2.3 (sanitise untrusted HTML with a vetted library)
 *  - OWASP DOM-based XSS Prevention Cheat Sheet: the innerHTML sink is fed a
 *    TrustedHTML/sanitised string; raw props never reach the sink directly.
 */
export default function RichText({ html, as = 'div', testId }) {
  const safe = useMemo(() => toSafeHtml(html), [html])
  const Tag = as
  // eslint-disable-next-line no-unsanitized/property -- `safe` is DOMPurify/TrustedTypes output (audited sink).
  return <Tag data-testid={testId} dangerouslySetInnerHTML={{ __html: safe }} />
}

/**
 * PlainText — explicit text-context encoder used when building non-JSX HTML
 * strings (clipboard exports, e-mail previews). Demonstrates rule #1 of the
 * XSS Prevention Cheat Sheet (encode all output).
 */
export function PlainText({ value, testId }) {
  return <span data-testid={testId}>{escapeHtml(value)}</span>
}
