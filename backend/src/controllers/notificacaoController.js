import {
  normalizeNotificacaoId,
  normalizeNotificacaoListQuery,
} from '../utils/notificacaoValidation.js'

export function createNotificacaoController(notificacaoService) {
  return {
    async list(request) {
      return notificacaoService.list(normalizeNotificacaoListQuery(request.query))
    },

    async unreadCount() {
      return { unreadCount: await notificacaoService.unreadCount() }
    },

    async markRead(request) {
      const item = await notificacaoService.markRead(normalizeNotificacaoId(request.params.id))
      return { data: { id: item.id, lida: item.lida } }
    },

    async markAllRead() {
      return { updated: await notificacaoService.markAllRead() }
    },
  }
}
