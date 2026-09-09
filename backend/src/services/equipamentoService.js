import { AppError } from '../utils/appError.js'
import {
  duplicatePatrimonioError,
  duplicateSerialError,
  fromUniqueConstraintError,
} from '../utils/equipamentoConflict.js'
import {
  normalizeCreateEquipamento,
  normalizeEquipamentoId,
  normalizeUpdateEquipamento,
} from '../utils/equipamentoValidation.js'
import { normalizeEquipamentoListQuery } from '../utils/equipamentoListValidation.js'

function notFoundError() {
  return new AppError({
    statusCode: 404,
    code: 'EQUIPAMENTO_NAO_ENCONTRADO',
    message: 'Equipamento não encontrado.',
  })
}

function sameDate(left, right) {
  return left.getTime() === right.getTime()
}

function contractChanged(current, changes) {
  return (
    (Object.hasOwn(changes, 'contratoOnecare') &&
      changes.contratoOnecare !== current.contratoOnecare) ||
    (Object.hasOwn(changes, 'dataInicioOnecare') &&
      !sameDate(changes.dataInicioOnecare, current.dataInicioOnecare)) ||
    (Object.hasOwn(changes, 'dataFimOnecare') &&
      !sameDate(changes.dataFimOnecare, current.dataFimOnecare))
  )
}

export function createEquipamentoService({ prisma, clock = () => new Date() }) {
  return {
    async list(query) {
      const normalized = normalizeEquipamentoListQuery(query)
      const where = { arquivado: false }

      if (normalized.q) {
        where.OR = [
          { serialNumber: { contains: normalized.q } },
          { partNumber: { contains: normalized.q } },
          { patrimonio: { contains: normalized.q } },
          { cliente: { contains: normalized.q } },
          { contratoOnecare: { contains: normalized.q } },
        ]
      }

      const total = await prisma.equipamento.count({ where })
      const totalPages = Math.ceil(total / normalized.limit)
      // Evita calcular offsets enormes para páginas que não possuem resultados.
      const equipamentos = normalized.page > totalPages
        ? []
        : await prisma.equipamento.findMany({
          where,
          orderBy: [
            { [normalized.sortBy]: normalized.order },
            { id: normalized.order },
          ],
          skip: (normalized.page - 1) * normalized.limit,
          take: normalized.limit,
        })

      return {
        equipamentos,
        page: normalized.page,
        limit: normalized.limit,
        total,
        totalPages,
        sortBy: normalized.sortBy,
        order: normalized.order,
      }
    },

    async create(payload) {
      const data = normalizeCreateEquipamento(payload)
      const duplicate = await prisma.equipamento.findUnique({
        where: { serialNumber: data.serialNumber },
        select: { id: true },
      })

      if (duplicate) {
        throw duplicateSerialError()
      }

      if (data.patrimonio) {
        const duplicatePatrimonio = await prisma.equipamento.findUnique({
          where: { patrimonio: data.patrimonio },
          select: { id: true },
        })

        if (duplicatePatrimonio) throw duplicatePatrimonioError()
      }

      try {
        return await prisma.equipamento.create({ data })
      } catch (error) {
        throw fromUniqueConstraintError(error) ?? error
      }
    },

    async findById(rawId) {
      const id = normalizeEquipamentoId(rawId)
      const equipamento = await prisma.equipamento.findFirst({
        where: { id, arquivado: false },
      })

      if (!equipamento) {
        throw notFoundError()
      }

      return equipamento
    },

    async update(rawId, payload) {
      const id = normalizeEquipamentoId(rawId)

      try {
        return await prisma.$transaction(async (transaction) => {
          const current = await transaction.equipamento.findFirst({
            where: { id, arquivado: false },
          })

          if (!current) {
            throw notFoundError()
          }

          const changes = normalizeUpdateEquipamento(payload, current)

          if (
            Object.hasOwn(changes, 'serialNumber') &&
            changes.serialNumber !== current.serialNumber
          ) {
            const duplicate = await transaction.equipamento.findFirst({
              where: {
                serialNumber: changes.serialNumber,
                NOT: { id },
              },
              select: { id: true },
            })

            if (duplicate) {
              throw duplicateSerialError()
            }
          }

          if (changes.patrimonio && changes.patrimonio !== current.patrimonio) {
            const duplicatePatrimonio = await transaction.equipamento.findFirst({
              where: { patrimonio: changes.patrimonio, NOT: { id } },
              select: { id: true },
            })

            if (duplicatePatrimonio) throw duplicatePatrimonioError()
          }

          if (contractChanged(current, changes)) {
            await transaction.historicoContrato.create({
              data: {
                equipamentoId: current.id,
                contratoOnecare: current.contratoOnecare,
                dataInicioOnecare: current.dataInicioOnecare,
                dataFimOnecare: current.dataFimOnecare,
              },
            })
          }

          return transaction.equipamento.update({
            where: { id },
            data: changes,
          })
        })
      } catch (error) {
        throw fromUniqueConstraintError(error) ?? error
      }
    },

    async archive(rawId) {
      const id = normalizeEquipamentoId(rawId)
      const equipamento = await prisma.equipamento.findFirst({
        where: { id, arquivado: false },
      })

      if (!equipamento) {
        throw notFoundError()
      }

      return prisma.equipamento.update({
        where: { id },
        data: {
          arquivado: true,
          arquivadoEm: clock(),
        },
      })
    },

    async restore(rawId) {
      const id = normalizeEquipamentoId(rawId)
      const equipamento = await prisma.equipamento.findFirst({
        where: { id, arquivado: true },
      })

      if (!equipamento) {
        throw notFoundError()
      }

      return prisma.equipamento.update({
        where: { id },
        data: {
          arquivado: false,
          arquivadoEm: null,
        },
      })
    },

    async listArchived() {
      return prisma.equipamento.findMany({
        where: { arquivado: true },
      })
    },
  }
}
