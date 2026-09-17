import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export function validateProxyTarget(value) {
  if (!value?.trim()) throw new Error('API_PROXY_TARGET é obrigatório no build da Netlify.')
  let url
  try { url = new URL(value) } catch { throw new Error('API_PROXY_TARGET deve ser uma URL HTTPS válida.') }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      (url.pathname !== '/' && url.pathname !== '')) {
    throw new Error('API_PROXY_TARGET deve ser uma origem HTTPS sem credenciais, caminho, query ou fragmento.')
  }
  return url.origin
}

export function netlifyRedirects(proxyTarget) {
  return `/api/*  ${validateProxyTarget(proxyTarget)}/:splat  200\n/*  /index.html  200\n`
}

export const NETLIFY_HEADERS = `/*
  Content-Security-Policy: default-src 'self'; base-uri 'self'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self'; upgrade-insecure-requests
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Cache-Control: no-cache, no-store, must-revalidate

/assets/*
  Cache-Control: public, max-age=31536000, immutable
`

export async function generateNetlifyFiles({ proxyTarget, outputDirectory = 'dist' }) {
  const output = resolve(outputDirectory)
  await mkdir(output, { recursive: true })
  await Promise.all([
    writeFile(resolve(output, '_redirects'), netlifyRedirects(proxyTarget), 'utf8'),
    writeFile(resolve(output, '_headers'), NETLIFY_HEADERS, 'utf8'),
  ])
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await generateNetlifyFiles({ proxyTarget: process.env.API_PROXY_TARGET })
}
