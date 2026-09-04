import { AppError } from '../utils/appError.js'
import {
  normalizeCreateEquipamento,
  normalizeEquipamentoId,
  normalizeUpdateEquipamento,
} from '../utils/equipamentoValidation.js'

function notFoundError() {
  return new AppError({
    statusCode: 404,
    code: 'EQUIPAMENTO_NAO_ENCONTRADO',
    message: 'Equipamento não encontrado.',
  })
}

function duplicateSerialError() {
  return new AppError({
    statusCode: 409,
    code: 'SERIAL_DUPLICADO',
    message: 'Equipamento com esse número de série já existe.',
  })
}

function isUniqueConstraintError(error) {
  return error?.code === 'P2002'
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
    async create(payload) {
      const data = normalizeCreateEquipamento(payload)
      const duplicate = await prisma.equipamento.findUnique({
        where: { serialNumber: data.serialNumber },
        select: { id: true },
      })

      if (duplicate) {
        throw duplicateSerialError()
      }

      try {
        return await prisma.equipamento.create({ data })
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw duplicateSerialError()
        }

        throw error
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
        if (isUniqueConstraintError(error)) {
          throw duplicateSerialError()
        }

        throw error
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
