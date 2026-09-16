import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Vite Configuration — Kyllang Certificate Portal (ZK Edition)
 *
 * Critical headers for ZK Web Worker operation:
 *
 *   Cross-Origin-Opener-Policy: same-origin
 *   Cross-Origin-Embedder-Policy: require-corp
 *
 *   These two headers together enable `crossOriginIsolated = true` in the
 *   browser, which is REQUIRED for:
 *     • SharedArrayBuffer (used by snarkjs WASM multi-threading)
 *     • Atomics.wait() in Workers
 *     • WASM bulk memory operations
 *   Without them, snarkjs proof generation in a Worker will throw a
 *   SecurityError or silently fall back to single-threaded mode.
 *
 *   Reference: https://web.dev/cross-origin-isolation-guide/
 *
 * CSP is updated to allow:
 *   • wasm-unsafe-eval — required by snarkjs WASM compilation
 *   • worker-src: blob: self — Web Workers created from Vite ?worker modules
 *   • connect-src ganache RPC — for trustless ethers.js eth_call
 */

// ── Content Security Policy ────────────────────────────────────────────────
const CSP = [
    "default-src 'self'",
    // wasm-unsafe-eval required for snarkjs WASM execution, unsafe-inline for Vite Dev
    "script-src 'self' 'wasm-unsafe-eval' 'unsafe-inline'",
    // Allow Web Workers (Vite ?worker produces blob: URLs in dev mode)
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    // Backend API + Ganache RPC + Vite HMR WebSocket
    [
        "connect-src",
        "'self'",
        "http://127.0.0.1:5000",
        "http://localhost:5000",
        "http://127.0.0.1:7545",  // Ganache JSON-RPC (for trustless eth_call)
        "http://localhost:7545",
        "ws://localhost:5173",
        "ws://127.0.0.1:5173",
    ].join(' '),
].join('; ');

// ── Shared security response headers ──────────────────────────────────────
const SECURITY_HEADERS = {
    // REQUIRED for SharedArrayBuffer + WASM threading in snarkjs
    'Cross-Origin-Opener-Policy':   'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    // Additional hardening
    'X-Content-Type-Options':  'nosniff',
    'X-Frame-Options':         'DENY',
    'Referrer-Policy':         'strict-origin-when-cross-origin',
    'Permissions-Policy':      'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': CSP,
};

export default defineConfig({
    plugins: [
        react(),
        // Inject COOP/COEP + CSP as <meta> tags for production builds
        // (server headers handle dev mode; meta tags handle static hosting)
        {
            name: 'kyllang-security-headers-plugin',
            transformIndexHtml(html) {
                const metaTags = [
                    `<meta http-equiv="Content-Security-Policy" content="${CSP}">`,
                    `<meta http-equiv="Cross-Origin-Opener-Policy" content="same-origin">`,
                    `<meta http-equiv="Cross-Origin-Embedder-Policy" content="require-corp">`,
                    `<meta http-equiv="X-Content-Type-Options" content="nosniff">`,
                ].join('\n    ');
                return html.replace('<head>', `<head>\n    ${metaTags}`);
            },
        },
    ],

    resolve: {
        alias: {
            buffer: 'buffer/',
        },
    },

    server: {
        port: 5173,
        headers: SECURITY_HEADERS,
        proxy: {
            '/api': {
                target: 'http://127.0.0.1:5000',
                changeOrigin: true,
                // Do NOT proxy Ganache RPC — let frontend call it directly (trustless)
            },
        },
    },

    // ── Build configuration ────────────────────────────────────────────────
    build: {
        target: 'es2022', // Required for BigInt, top-level await, WASM ESM
        rollupOptions: {
            output: {
                // Split snarkjs into its own chunk to avoid bloating main bundle
                manualChunks: {
                    snarkjs: ['snarkjs'],
                    circomlibjs: ['circomlibjs'],
                },
            },
        },
    },

    // ── WASM support ───────────────────────────────────────────────────────
    optimizeDeps: {
        // Exclude snarkjs and circomlibjs from pre-bundling
        // (they contain WASM and must be loaded asynchronously)
        include: ['blake2b', 'blake-hash'],
        exclude: ['snarkjs', 'circomlibjs'],
    },

    // ── Worker bundling ────────────────────────────────────────────────────
    worker: {
        format: 'es',       // ESM workers (required for import statements in worker)
        plugins: [],  // Use same plugins as main build
    },
});
