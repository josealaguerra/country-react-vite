import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const apiProxy = {
  '/api': {
    target: process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:3000',
    changeOrigin: true,
  },
}

export default defineConfig({
  plugins: [react()],
  envDir: false,
  server: {
    proxy: apiProxy,
  },
  preview: {
    proxy: apiProxy,
  },
})
