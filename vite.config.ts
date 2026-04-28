import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/moneydj': {
        target: 'https://www.moneydj.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/moneydj/, '')
      },
      '/api/twse_www': {
        target: 'https://www.twse.com.tw',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/twse_www/, '')
      },
      '/api/twse': {
        target: 'https://mis.twse.com.tw',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/twse/, '')
      },
      '/api/yahoo': {
        target: 'https://query2.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/yahoo/, ''),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Origin': 'https://finance.yahoo.com',
          'Referer': 'https://finance.yahoo.com/'
        }
      },
      '/api/tpex': {
        target: 'https://www.tpex.org.tw',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/tpex/, '')
      },
      '/api/finmind': {
        target: 'https://api.finmindtrade.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/finmind/, '')
      },
      '/api/twse_open': {
        target: 'https://openapi.twse.com.tw',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/twse_open/, '')
      }
    }
  }
})
