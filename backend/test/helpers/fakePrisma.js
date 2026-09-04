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

function matchesWhere(equipamento, where) {
  if (where.id !== undefined && equipamento.id !== where.id) {
    return false
  }

  if (
    where.arquivado !== undefined &&
    equipamento.arquivado !== where.arquivado
  ) {
    return false
  }

  if (
    where.serialNumber !== undefined &&
    equipamento.serialNumber !== where.serialNumber
  ) {
    return false
  }

  if (where.NOT?.id !== undefined && equipamento.id === where.NOT.id) {
    return false
  }

  return true
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
        return (
          state.equipamentos.find(
            (item) => item.serialNumber === where.serialNumber,
          ) ?? null
        )
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

      async findMany({ where }) {
        return state.equipamentos.filter((item) => matchesWhere(item, where))
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
