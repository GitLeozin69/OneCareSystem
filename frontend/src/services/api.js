import { API_BASE_PATH } from '../config/apiConfig.js'

const messages = {
  SERIAL_DUPLICADO: 'Já existe um equipamento com esse número de série.',
  PATRIMONIO_DUPLICADO: 'Já existe um equipamento com esse patrimônio.',
  EQUIPAMENTO_NAO_ENCONTRADO: 'Equipamento não encontrado ou arquivado.',
  CONFLITO_ATUALIZACAO: 'O equipamento foi alterado durante a operação. Atualize os dados e tente novamente.',
  SERIAL_INVALIDO: 'O serial deve conter apenas letras de A a Z e números.',
  CAMPO_OBRIGATORIO: 'Preencha os campos obrigatórios.',
  CAMPO_INVALIDO: 'Verifique o valor informado.',
  CAMPO_MUITO_LONGO: 'O valor excede o tamanho permitido.',
  DATA_INVALIDA: 'Informe uma data válida.',
  INTERVALO_DATAS_INVALIDO: 'O término não pode ser anterior ao início do OneCare.',
  REQUISICAO_INVALIDA: 'Verifique os dados informados.',
  PARAMETRO_INVALIDO: 'Verifique os parâmetros da consulta.',
  FORMATO_INVALIDO: 'Envie somente uma planilha .xlsx no campo arquivo.',
  ARQUIVO_INVALIDO: 'Arquivo inválido, protegido ou fora dos limites de segurança.',
  ARQUIVO_VAZIO: 'A planilha está vazia.',
  ARQUIVO_AUSENTE: 'Selecione uma planilha.',
  LIMITE_ARQUIVO: 'O arquivo excede o limite de tamanho permitido.',
  LIMITE_LINHAS: 'A planilha excede o limite de linhas permitido.',
  CABECALHO_INVALIDO: 'Corrija os cabeçalhos da planilha.',
  IMPORTACAO_INVALIDA: 'Nenhum equipamento foi importado. Corrija todas as linhas inválidas.',
  IMPORTACAO_CONFLITO: 'Conflito na confirmação. Nenhum equipamento foi importado; valide novamente.',
  IMPORTACAO_OCUPADA: 'Há importações em andamento. Tente novamente em instantes.',
  NOTIFICACAO_NAO_ENCONTRADA: 'Notificação não encontrada.',
  CREDENCIAIS_INVALIDAS: 'Usuário ou senha inválidos.',
  LIMITE_LOGIN: 'Muitas tentativas. Aguarde 15 minutos e tente novamente.',
  LIMITE_REQUISICOES: 'Muitas solicitações. Aguarde e tente novamente.',
  LIMITE_REQUISICAO: 'A solicitação excede o limite de tamanho permitido.',
  NAO_AUTENTICADO: 'Sua sessão expirou. Entre novamente.',
  ACESSO_NEGADO: 'Você não tem permissão para realizar esta ação.',
  ORIGEM_NAO_PERMITIDA: 'A origem da solicitação não foi permitida.',
  CSRF_INVALIDO: 'A proteção da sessão expirou. Atualize a página e tente novamente.',
  USERNAME_INVALIDO: 'Use de 3 a 50 caracteres: letras, números, ponto, hífen ou sublinhado.',
  SENHA_INVALIDA: 'A senha deve ter de 8 a 128 caracteres e não pode conter somente espaços.',
  SENHA_ATUAL_INCORRETA: 'A senha atual está incorreta.',
  CONFIRMACAO_SENHA_INVALIDA: 'A confirmação deve ser igual à nova senha.',
  SENHA_REUTILIZADA: 'A nova senha deve ser diferente da senha atual.',
  ALTERACAO_SENHA_NAO_CONCLUIDA: 'A alteração não foi concluída. Entre novamente e tente outra vez.',
  USERNAME_DUPLICADO: 'Já existe um usuário com esse nome.',
  USUARIO_NAO_ENCONTRADO: 'Usuário não encontrado.',
  OPERACAO_NAO_PERMITIDA: 'Esta operação não é permitida.',
}

export class ApiError extends Error {
  constructor(message, { code, status, fields = {}, details = [] } = {}) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.fields = fields
    this.details = details
  }
}

const editableFields = new Set([
  'serialNumber', 'partNumber', 'cliente', 'patrimonio', 'contratoOnecare',
  'notaFiscal', 'distribuidor', 'dataInicioOnecare', 'dataFimOnecare',
  'dataUltimaConferencia',
])

let csrfToken = ''
let onUnauthorized = () => {}
let onForbidden = () => {}

export function configureApiSecurity(config = {}) {
  if ('csrfToken' in config) csrfToken = config.csrfToken ?? ''
  if (config.onUnauthorized) onUnauthorized = config.onUnauthorized
  if (config.onForbidden) onForbidden = config.onForbidden
}

async function request(path, { signal, method = 'GET', body, suppressAuthEvents = false } = {}) {
  let response
  const multipart = body instanceof FormData
  const mutating = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)
  const headers = {}
  if (body && !multipart) headers['Content-Type'] = 'application/json'
  if (mutating && csrfToken) headers['x-csrf-token'] = csrfToken
  try {
    response = await fetch(`${API_BASE_PATH}${path}`, {
      method,
      signal,
      credentials: 'include',
      headers: Object.keys(headers).length ? headers : undefined,
      body: multipart ? body : body ? JSON.stringify(body) : undefined,
    })
  } catch (error) {
    if (error.name === 'AbortError') throw error
    throw new ApiError('Não foi possível conectar ao servidor. Verifique a conexão e tente novamente.')
  }

  if (response.ok && response.status === 204) return null
  const data = await response.json().catch(() => null)
  if (!response.ok || !data) {
    const code = response.status < 500 ? data?.error : undefined
    const message = messages[code] ?? 'Não foi possível processar a solicitação. Tente novamente.'
    const fields = {}
    if (messages[code]) {
      for (const detail of Array.isArray(data?.details) ? data.details : []) {
        const field = typeof detail.field === 'string' ? detail.field.replace(/^\//, '') : ''
        if (editableFields.has(field)) fields[field] = message
      }
    }
    if (code === 'SERIAL_DUPLICADO') fields.serialNumber = message
    if (code === 'PATRIMONIO_DUPLICADO') fields.patrimonio = message
    if (!suppressAuthEvents && response.status === 401) onUnauthorized()
    if (!suppressAuthEvents && response.status === 403) onForbidden()
    throw new ApiError(message, { code, status: response.status, fields,
      details: messages[code] && Array.isArray(data?.details) ? data.details : [] })
  }
  return data
}

export const authApi = {
  csrf(signal) { return request('/auth/csrf', { signal, suppressAuthEvents: true }) },
  login(payload) { return request('/auth/login', { method: 'POST', body: payload, suppressAuthEvents: true }) },
  me(signal) { return request('/auth/me', { signal, suppressAuthEvents: true }) },
  logout() { return request('/auth/logout', { method: 'POST', suppressAuthEvents: true }) },
  changeOwnPassword(payload) { return request('/auth/senha', { method: 'PATCH', body: payload }) },
}

export const usuariosApi = {
  list(signal) { return request('/usuarios', { signal }) },
  create(payload) { return request('/usuarios', { method: 'POST', body: payload }) },
  setStatus(id, ativo) { return request(`/usuarios/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: { ativo } }) },
  resetPassword(id, password) { return request(`/usuarios/${encodeURIComponent(id)}/senha`, { method: 'PATCH', body: { password } }) },
}

export const equipamentosApi = {
  validateImport(file, signal) {
    const body = new FormData()
    body.append('arquivo', file)
    return request('/equipamentos/importacao/validar', { method: 'POST', body, signal })
  },
  confirmImport(file, signal) {
    const body = new FormData()
    body.append('arquivo', file)
    return request('/equipamentos/importacao/confirmar', { method: 'POST', body, signal })
  },
  list(query, signal) {
    const params = new URLSearchParams({
      page: query.page, limit: query.limit, sortBy: query.sortBy, order: query.order,
    })
    if (query.q) params.set('q', query.q)
    if (query.status) params.set('status', query.status)
    return request(`/equipamentos?${params}`, { signal })
  },
  listArchived(query, signal) {
    const params = new URLSearchParams({
      page: query.page, limit: query.limit, sortBy: query.sortBy, order: query.order,
    })
    if (query.q) params.set('q', query.q)
    return request(`/equipamentos/arquivados?${params}`, { signal })
  },
  get(id, signal) {
    return request(`/equipamentos/${encodeURIComponent(id)}`, { signal })
  },
  create(payload) {
    return request('/equipamentos', { method: 'POST', body: payload })
  },
  update(id, payload) {
    return request(`/equipamentos/${encodeURIComponent(id)}`, { method: 'PATCH', body: payload })
  },
  archive(id) {
    return request(`/equipamentos/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },
  restore(id) {
    return request(`/equipamentos/${encodeURIComponent(id)}/restaurar`, { method: 'PATCH' })
  },
  history(id, query, signal) {
    const params = new URLSearchParams({ page: query.page, limit: query.limit })
    return request(`/equipamentos/${encodeURIComponent(id)}/historico-contratos?${params}`, { signal })
  },
}

export const dashboardApi = {
  summary(signal) {
    return request('/dashboard/resumo', { signal })
  },
}

export const notificacoesApi = {
  list(query, signal) {
    const params = new URLSearchParams({ page: query.page, limit: query.limit })
    if (query.lida !== undefined) params.set('lida', query.lida)
    return request(`/notificacoes?${params}`, { signal })
  },
  unreadCount(signal) {
    return request('/notificacoes/nao-lidas/contagem', { signal })
  },
  markRead(id) {
    return request(`/notificacoes/${encodeURIComponent(id)}/ler`, { method: 'PATCH' })
  },
  markAllRead() {
    return request('/notificacoes/ler-todas', { method: 'PATCH' })
  },
}
