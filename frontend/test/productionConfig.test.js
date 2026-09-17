import { expect, it } from 'vitest'

import { resolveApiBasePath } from '../src/config/apiConfig.js'
import { NETLIFY_HEADERS, netlifyRedirects, validateProxyTarget } from '../scripts/generateNetlifyFiles.js'

it('mantém a API em caminho same-origin e rejeita URLs ou caminhos inseguros', () => {
  expect(resolveApiBasePath()).toBe('/api')
  expect(resolveApiBasePath('/api/')).toBe('/api')
  for (const value of ['https://api.example', '//api.example', '/api?token=x', '/api#x', 'api']) {
    expect(() => resolveApiBasePath(value)).toThrow()
  }
})

it('valida o destino HTTPS do proxy sem credenciais ou partes extras', () => {
  expect(validateProxyTarget('https://api.example')).toBe('https://api.example')
  for (const value of ['', 'http://api.example', 'https://u:p@api.example',
    'https://api.example/path', 'https://api.example?q=1']) {
    expect(() => validateProxyTarget(value)).toThrow()
  }
})

it('gera proxy antes do fallback SPA e headers restritivos com cache de assets', () => {
  const rules = netlifyRedirects('https://api.example').trim().split('\n')
  expect(rules[0]).toBe('/api/*  https://api.example/:splat  200')
  expect(rules[1]).toBe('/*  /index.html  200')
  expect(NETLIFY_HEADERS).toContain("Content-Security-Policy: default-src 'self'")
  expect(NETLIFY_HEADERS).toContain('X-Frame-Options: DENY')
  expect(NETLIFY_HEADERS).toContain('max-age=31536000, immutable')
  expect(NETLIFY_HEADERS).not.toContain('Strict-Transport-Security')
})
