const messages = {
  SERIAL_DUPLICADO: 'Já existe um equipamento com esse número de série.',
  PATRIMONIO_DUPLICADO: 'Já existe um equipamento com esse patrimônio.',
  EQUIPAMENTO_NAO_ENCONTRADO: 'Equipamento não encontrado ou arquivado.',
  SERIAL_INVALIDO: 'O serial deve conter apenas letras de A a Z e números.',
  CAMPO_OBRIGATORIO: 'Preencha os campos obrigatórios.',
  CAMPO_INVALIDO: 'Verifique o valor informado.',
  CAMPO_MUITO_LONGO: 'O valor excede o tamanho permitido.',
  DATA_INVALIDA: 'Informe uma data válida.',
  INTERVALO_DATAS_INVALIDO: 'O término não pode ser anterior ao início do OneCare.',
  REQUISICAO_INVALIDA: 'Verifique os dados informados.',
  PARAMETRO_INVALIDO: 'Verifique os parâmetros da consulta.',
}

export class ApiError extends Error {
  constructor(message, { code, status, fields = {} } = {}) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.fields = fields
  }
}

const editableFields = new Set([
  'serialNumber', 'partNumber', 'cliente', 'patrimonio', 'contratoOnecare',
  'notaFiscal', 'distribuidor', 'dataInicioOnecare', 'dataFimOnecare',
  'dataUltimaConferencia',
])

async function request(path, { signal, method = 'GET', body } = {}) {
  let response
  try {
    response = await fetch(`/api${path}`, {
      method,
      signal,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch (error) {
    if (error.name === 'AbortError') throw error
    throw new ApiError('Não foi possível conectar ao servidor. Verifique a conexão e tente novamente.')
  }

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
    throw new ApiError(message, { code, status: response.status, fields })
  }
  return data
}

export const equipamentosApi = {
  list(query, signal) {
    const params = new URLSearchParams({
      page: query.page, limit: query.limit, sortBy: query.sortBy, order: query.order,
    })
    if (query.q) params.set('q', query.q)
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
