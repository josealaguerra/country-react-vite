/**
 * vitest.config.ts — unit + security test runner for country-react-vite.
 *
 * Security constraints baked into the test environment:
 *  - jsdom with a FIXED, trusted origin (`https://countriesdex.example`): any
 *    code that tries to read `document.cookie` / storage from an unexpected
 *    context fails loudly (ASVS V3.4, DOM-XSS cheat-sheet assumptions).
 *  - `globals: false` keeps Node intrinsics out of the DOM realm, reducing
 *    prototype-pollution blast radius in tests (NIST CSF PR.PS-2 secure config).
 *  - Coverage thresholds force the security-critical modules to stay covered.
 */
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Keep app build behaviour identical so tests exercise production-like JSX.
  plugins: [react()],
  define: {
    // Deterministic env for tests; never let real secrets leak into the realm.
    'import.meta.env.VITE_API_URL': JSON.stringify('/api'),
  },
  test: {
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        // Pinned origin: relative URLs resolve predictably; localStorage &
        // cookies are scoped to this fake, isolated domain — no real data.
        url: 'https://countriesdex.example/',
      },
    },
    globals: false,
    setupFiles: ['./tests/setup.security.ts'],
    include: ['tests/**/*.test.{ts,tsx,js,jsx}'],
    // Fail the suite if a test leaves timers/requests behind (DoS-ish leaks).
    pool: 'threads',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/utils/**', 'src/components/**', 'src/api/**'],
      thresholds: {
        // Security-critical code must remain well covered (DevSecOps gate).
        'src/utils/security.js': { lines: 90, functions: 90 },
        'src/components/ErrorBoundary.jsx': { lines: 85 },
        lines: 75,
        functions: 75,
      },
    },
    // Report slow tests; oversized payloads/timeouts are DoS signals (OWASP A05 review).
    reportSlowTests: { fileThreshold: 1000, testThreshold: 500 },
  },
})
