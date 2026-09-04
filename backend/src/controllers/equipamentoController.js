import { serializeEquipamento } from '../utils/equipamentoSerializer.js'

export function createEquipamentoController(equipamentoService) {
  return {
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

    async listArchived() {
      const equipamentos = await equipamentoService.listArchived()

      return {
        items: equipamentos.map(serializeEquipamento),
      }
    },
  }
}
