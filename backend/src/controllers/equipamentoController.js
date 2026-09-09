import { serializeEquipamento } from '../utils/equipamentoSerializer.js'
import { serializeHistoricoContrato } from '../utils/historicoContratoSerializer.js'

function serializeList(result) {
  return {
    data: result.equipamentos.map(serializeEquipamento),
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    },
    sort: {
      sortBy: result.sortBy,
      order: result.order,
    },
  }
}

export function createEquipamentoController(equipamentoService) {
  return {
    async list(request) {
      const result = await equipamentoService.list(request.query)

      return serializeList(result)
    },

    async create(request, reply) {
      const equipamento = await equipamentoService.create(request.body)

      return reply.code(201).send({
        item: serializeEquipamento(equipamento),
      })
    },

    async findById(request) {
      const equipamento = await equipamentoService.findById(request.params.id)

      return {
        item: serializeEquipamento(equipamento),
      }
    },

    async update(request) {
      const equipamento = await equipamentoService.update(
        request.params.id,
        request.body,
      )

      return {
        item: serializeEquipamento(equipamento),
      }
    },

    async archive(request) {
      const equipamento = await equipamentoService.archive(request.params.id)

      return {
        item: serializeEquipamento(equipamento),
        message: 'Equipamento arquivado com sucesso.',
      }
    },

    async restore(request) {
      const equipamento = await equipamentoService.restore(request.params.id)

      return {
        item: serializeEquipamento(equipamento),
        message: 'Equipamento restaurado com sucesso.',
      }
    },

    async listArchived(request) {
      const result = await equipamentoService.listArchived(request.query)

      return serializeList(result)
    },

    async listContractHistory(request) {
      const result = await equipamentoService.listContractHistory(
        request.params.id,
        request.query,
      )

      return {
        data: result.data.map(serializeHistoricoContrato),
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages,
        },
      }
    },
  }
}
