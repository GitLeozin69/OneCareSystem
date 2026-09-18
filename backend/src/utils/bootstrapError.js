const SAFE_BOOTSTRAP_MESSAGES = new Set([
  'ALLOWED_HOSTS deve conter hostnames explícitos.',
  'ALLOWED_HOSTS é obrigatório em produção.',
  'Autenticação é obrigatória em produção.',
  'COOKIE_SECURE deve ser true em produção.',
  'COOKIE_SECURE deve ser true ou false.',
  'CSRF_SECRET com pelo menos 32 caracteres é obrigatório em produção.',
  'DATABASE_URL deve usar o protocolo MySQL.',
  'DATABASE_URL não está configurada.',
  'DATABASE_URL não é uma URL válida.',
  'DATABASE_URL é obrigatória.',
  'FRONTEND_ORIGIN deve conter origens HTTP(S) explícitas, separadas por vírgula.',
  'FRONTEND_ORIGIN deve usar HTTPS em produção.',
  'FRONTEND_ORIGIN é obrigatório em produção.',
  'LOG_LEVEL inválido.',
  'LOG_LEVEL não pode ser silent em produção.',
  'NODE_ENV deve ser development, test ou production.',
  'O script start aceita somente NODE_ENV=production.',
  'PORT deve ser um inteiro entre 1 e 65535.',
  'Serviços de autenticação incompletos.',
  'SESSION_DURATION_HOURS deve ser um inteiro entre 1 e 168.',
  'TRUST_PROXY permanece desabilitado até a validação da topologia publicada.',
])

const SAFE_IDENTIFIER = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/
const GENERIC_MESSAGE = 'Falha interna durante a inicialização.'

function safeProperty(error, property) {
  try {
    const value = error?.[property]
    if (typeof value === 'string' || typeof value === 'number') return String(value)
  } catch {
    return undefined
  }
  return undefined
}

export function safeBootstrapError(error) {
  const rawName = safeProperty(error, 'name')
  const rawCode = safeProperty(error, 'code')
  const rawMessage = safeProperty(error, 'message')
  const result = {
    errorName: rawName && SAFE_IDENTIFIER.test(rawName) ? rawName : 'Error',
    message: SAFE_BOOTSTRAP_MESSAGES.has(rawMessage) ? rawMessage : GENERIC_MESSAGE,
  }
  if (rawCode && SAFE_IDENTIFIER.test(rawCode)) result.errorCode = rawCode
  return result
}

export function logBootstrapError(error, writeLine = (line) => process.stderr.write(`${line}\n`)) {
  const entry = {
    level: 'error',
    event: 'backend_bootstrap_failed',
    ...safeBootstrapError(error),
  }
  writeLine(JSON.stringify(entry))
}

export async function runBootstrap(start, {
  processRef = process,
  writeLine = (line) => process.stderr.write(`${line}\n`),
} = {}) {
  try {
    await start()
    return true
  } catch (error) {
    logBootstrapError(error, writeLine)
    processRef.exitCode = 1
    return false
  }
}
