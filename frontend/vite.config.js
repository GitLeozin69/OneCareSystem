import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_')
  const target = env.VITE_DEV_API_ORIGIN || 'http://127.0.0.1:3000'
  const parsedTarget = new URL(target)
  if (!['http:', 'https:'].includes(parsedTarget.protocol) || parsedTarget.username || parsedTarget.password ||
      parsedTarget.origin !== target) throw new Error('VITE_DEV_API_ORIGIN deve ser uma origem HTTP(S) segura.')
  const proxy = {
    '/api': {
      target,
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/api/, ''),
    },
  }
  return {
    envDir: '.',
    plugins: [react(), tailwindcss()],
    server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy },
    preview: { host: '127.0.0.1', port: 4173, strictPort: true, proxy },
  }
})
