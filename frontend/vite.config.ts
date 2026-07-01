import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import http from 'http'

// ============================================================
// Dify 反向代理 — 解决两个问题：
// 1. X-Frame-Options: DENY 阻止 iframe 嵌入
// 2. Dify 是 Next.js 应用，使用 /_next/、/api/ 等绝对路径，
//    路径前缀代理（如 /dify/）会导致所有静态资源 404
//
// 方案：在独立端口 5174 启动透明反向代理，直接转发所有请求
//       到 Dify 服务器，同时剥离阻止 iframe 的响应头。
// ============================================================

const DIFY_TARGET = process.env.VITE_DIFY_TARGET || 'http://10.10.9.65:80'
const DIFY_PROXY_PORT = 5174

function difyProxyPlugin(): Plugin {
  return {
    name: 'dify-proxy',
    configureServer() {
      const server = http.createServer((req, res) => {
        const url = new URL(req.url || '/', DIFY_TARGET)

        const proxyReq = http.request(
          {
            hostname: url.hostname,
            port: url.port || 80,
            path: url.pathname + url.search,
            method: req.method,
            headers: {
              ...req.headers,
              host: url.hostname,
            },
          },
          (proxyRes) => {
            // 复制响应头，剥离阻止 iframe 的头部
            const headers = { ...proxyRes.headers }
            delete headers['x-frame-options']
            if (headers['content-security-policy']) {
              headers['content-security-policy'] = (
                headers['content-security-policy'] as string
              ).replace(/frame-ancestors\s+[^;]+;?\s*/gi, '')
            }

            res.writeHead(proxyRes.statusCode || 200, headers)
            proxyRes.pipe(res)
          }
        )

        proxyReq.on('error', (e) => {
          console.error('[dify-proxy] Error:', e.message)
          if (!res.headersSent) {
            res.writeHead(502)
            res.end('Dify proxy error: ' + e.message)
          }
        })

        req.pipe(proxyReq)
      })

      server.listen(DIFY_PROXY_PORT, () => {
        console.log(
          `  🌐 Dify proxy: http://localhost:${DIFY_PROXY_PORT} → ${DIFY_TARGET}`
        )
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), difyProxyPlugin()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
