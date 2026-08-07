import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// KYLLANG_V4: Strict Content Security Policy to protect zkWorker.js memory from XSS
const csp = "default-src 'self'; script-src 'self'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' http://127.0.0.1:5000 http://localhost:5000 ws://localhost:5173 ws://127.0.0.1:5173;";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'html-csp-plugin',
      transformIndexHtml(html) {
        return html.replace(
          /<head>/,
          `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}">`
        );
      }
    }
  ],
  server: {
    headers: {
      'Content-Security-Policy': csp
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
    }
  },
})
