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
        rewrite: (path) => path.replace(/^\/api\/twse_www/, ''),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://www.twse.com.tw/'
        }
      },
      '/api/twse': {
        target: 'https://mis.twse.com.tw',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/twse/, ''),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://mis.twse.com.tw/'
        }
      },
      '/api/yahoo': {
        target: 'https://query2.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/yahoo/, ''),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept-Encoding': 'gzip, deflate, br',
          'Origin': 'https://finance.yahoo.com',
          'Referer': 'https://finance.yahoo.com/',
          'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'same-site',
        }
      },
      '/api/tpex': {
        target: 'https://www.tpex.org.tw',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/tpex/, ''),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://www.tpex.org.tw/'
        }
      },
      '/api/finmind': {
        target: 'https://api.finmindtrade.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/finmind/, '')
      },
      '/api/twse_open': {
        target: 'https://openapi.twse.com.tw',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/twse_open/, ''),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://openapi.twse.com.tw/'
        }
      }
    }
  }
})
