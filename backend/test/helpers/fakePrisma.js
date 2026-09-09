const baseTimestamp = new Date('2026-09-04T12:00:00.000Z')

export function createEquipamentoRecord(overrides = {}) {
  return {
    id: 1,
    serialNumber: 'SN001',
    partNumber: 'PN001',
    cliente: 'Cliente Teste',
    patrimonio: null,
    contratoOnecare: null,
    dataInicioOnecare: new Date('2026-01-01T00:00:00.000Z'),
    dataFimOnecare: new Date('2026-12-31T00:00:00.000Z'),
    dataUltimaConferencia: null,
    arquivado: false,
    arquivadoEm: null,
    createdAt: baseTimestamp,
    updatedAt: baseTimestamp,
    ...overrides,
  }
}

function matchesValue(value, condition) {
  if (
    condition &&
    typeof condition === 'object' &&
    !(condition instanceof Date)
  ) {
    if (Object.hasOwn(condition, 'contains')) {
      return value !== null && value !== undefined &&
        String(value).toLocaleLowerCase().includes(
          String(condition.contains).toLocaleLowerCase(),
        )
    }
  }

  return value === condition
}

function matchesWhere(equipamento, where = {}) {
  if (where.OR && !where.OR.some((condition) => matchesWhere(equipamento, condition))) {
    return false
  }

  if (where.NOT && matchesWhere(equipamento, where.NOT)) {
    return false
  }

  return Object.entries(where).every(([field, condition]) => {
    if (field === 'OR' || field === 'NOT') return true
    return matchesValue(equipamento[field], condition)
  })
}

function compareValues(left, right) {
  if (left === right) return 0
  if (left === null || left === undefined) return -1
  if (right === null || right === undefined) return 1
  if (typeof left === 'number' && typeof right === 'number') return left - right

  if (left instanceof Date && right instanceof Date) {
    return left.getTime() - right.getTime()
  }

  return String(left).localeCompare(String(right), 'pt-BR')
}

export function createFakePrisma(initialEquipamentos = []) {
  const state = {
    equipamentos: [...initialEquipamentos],
    historicos: [],
    transactionCalls: 0,
  }

  const prisma = {
    equipamento: {
      async findUnique({ where }) {
        return state.equipamentos.find((item) => matchesWhere(item, where)) ?? null
      },

      async findFirst({ where }) {
        return state.equipamentos.find((item) => matchesWhere(item, where)) ?? null
      },

      async create({ data }) {
        const equipamento = createEquipamentoRecord({
          ...data,
          id: state.equipamentos.length + 1,
        })
        state.equipamentos.push(equipamento)
        return equipamento
      },

      async update({ where, data }) {
        const index = state.equipamentos.findIndex((item) => item.id === where.id)
        const equipamento = {
          ...state.equipamentos[index],
          ...data,
          updatedAt: baseTimestamp,
        }
        state.equipamentos[index] = equipamento
        return equipamento
      },

      async findMany({ where, orderBy, skip = 0, take } = {}) {
        const equipamentos = state.equipamentos.filter(
          (item) => matchesWhere(item, where),
        )

        if (orderBy) {
          const rules = Array.isArray(orderBy) ? orderBy : [orderBy]
          equipamentos.sort((left, right) => {
            for (const rule of rules) {
              const [field, order] = Object.entries(rule)[0]
              const comparison = compareValues(left[field], right[field])

              if (comparison !== 0) {
                return order === 'desc' ? -comparison : comparison
              }
            }

            return 0
          })
        }

        return equipamentos.slice(skip, take === undefined ? undefined : skip + take)
      },

      async count({ where } = {}) {
        return state.equipamentos.filter((item) => matchesWhere(item, where)).length
      },
    },

    historicoContrato: {
      async create({ data }) {
        const historico = {
          id: state.historicos.length + 1,
          ...data,
          substituidoEm: baseTimestamp,
        }
        state.historicos.push(historico)
        return historico
      },
    },

    async $transaction(callback) {
      state.transactionCalls += 1
      return callback(prisma)
    },
  }

  return { prisma, state }
}
