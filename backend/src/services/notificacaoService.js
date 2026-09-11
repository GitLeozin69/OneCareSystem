import { AppError } from '../utils/appError.js'
import {
  calculateOnecareStatus,
  createOnecareReference,
  withOnecareStatus,
} from '../utils/onecareStatus.js'

export const NOTIFICATION_TYPES = {
  EXPIRING: 'ONECARE_VENCENDO',
  EXPIRED: 'ONECARE_VENCIDO',
}

function dateKey(value) {
  return value.toISOString().slice(0, 10)
}

function notificationMessage(equipamento, status, days) {
  if (status === 'VENCIDO') {
    const elapsed = Math.abs(days)
    if (elapsed === 1) return `O OneCare do equipamento ${equipamento.serialNumber} venceu há 1 dia.`
    return `O OneCare do equipamento ${equipamento.serialNumber} venceu há ${elapsed} dias.`
  }
  if (days === 0) return `O OneCare do equipamento ${equipamento.serialNumber} vence hoje.`
  if (days === 1) return `O OneCare do equipamento ${equipamento.serialNumber} vence em 1 dia.`
  return `O OneCare do equipamento ${equipamento.serialNumber} vence em ${days} dias.`
}

function serializeNotification(notification, reference) {
  return {
    id: notification.id,
    tipo: notification.tipo,
    mensagem: notification.mensagem,
    lida: notification.lida,
    createdAt: notification.createdAt,
    equipamento: notification.equipamento
      ? withOnecareStatus(notification.equipamento, reference)
      : null,
  }
}

function notFound() {
  return new AppError({
    statusCode: 404,
    code: 'NOTIFICACAO_NAO_ENCONTRADA',
    message: 'Notificação não encontrada.',
  })
}

export function createNotificacaoService({ prisma, clock = () => new Date() }) {
  return {
    async processExpirations() {
      const reference = createOnecareReference(clock())
      const equipamentos = await prisma.equipamento.findMany({
        where: {
          arquivado: false,
          dataFimOnecare: { lte: reference.threeMonthLimit },
        },
        select: { id: true, serialNumber: true, dataFimOnecare: true },
      })

      const data = equipamentos.flatMap((equipamento) => {
        const { statusOnecare, diasRestantes } = calculateOnecareStatus(
          equipamento.dataFimOnecare,
          reference,
        )
        if (statusOnecare !== 'VENCENDO' && statusOnecare !== 'VENCIDO') return []

        const tipo = statusOnecare === 'VENCENDO'
          ? NOTIFICATION_TYPES.EXPIRING
          : NOTIFICATION_TYPES.EXPIRED
        return [{
          equipamentoId: equipamento.id,
          tipo,
          mensagem: notificationMessage(equipamento, statusOnecare, diasRestantes),
          eventoChave: dateKey(equipamento.dataFimOnecare),
        }]
      })

      let created = 0
      for (let start = 0; start < data.length; start += 500) {
        const result = await prisma.notificacao.createMany({
          data: data.slice(start, start + 500),
          skipDuplicates: true,
        })
        created += result.count
      }

      return { eligible: data.length, created, ignored: data.length - created }
    },

    async list({ page, limit, lida }) {
      const where = lida === undefined ? {} : { lida }
      const reference = createOnecareReference(clock())
      return prisma.$transaction(async (tx) => {
        const [total, unreadCount] = await Promise.all([
          tx.notificacao.count({ where }),
          tx.notificacao.count({ where: { lida: false } }),
        ])
        const totalPages = Math.ceil(total / limit)
        const data = totalPages === 0 || page > totalPages ? [] : await tx.notificacao.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * limit,
          take: limit,
          include: {
            equipamento: {
              select: {
                id: true,
                serialNumber: true,
                partNumber: true,
                cliente: true,
                patrimonio: true,
                dataFimOnecare: true,
                arquivado: true,
              },
            },
          },
        })

        return {
          data: data.map((item) => serializeNotification(item, reference)),
          pagination: { page, limit, total, totalPages },
          unreadCount,
        }
      })
    },

    async unreadCount() {
      return prisma.notificacao.count({ where: { lida: false } })
    },

    async markRead(id) {
      const notification = await prisma.notificacao.findUnique({ where: { id } })
      if (!notification) throw notFound()
      if (notification.lida) return notification
      return prisma.notificacao.update({ where: { id }, data: { lida: true } })
    },

    async markAllRead() {
      const result = await prisma.notificacao.updateMany({
        where: { lida: false },
        data: { lida: true },
      })
      return result.count
    },
  }
}
