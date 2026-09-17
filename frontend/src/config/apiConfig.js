export function resolveApiBasePath(value = '/api') {
  const candidate = value?.trim() || '/api'
  if (!candidate.startsWith('/') || candidate.startsWith('//') || /[?#\\]/.test(candidate)) {
    throw new Error('VITE_API_BASE_PATH deve ser um caminho relativo seguro.')
  }
  const normalized = candidate.replace(/\/+$/, '')
  return normalized || '/api'
}

export const API_BASE_PATH = resolveApiBasePath(import.meta.env.VITE_API_BASE_PATH)
