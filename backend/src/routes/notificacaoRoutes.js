import { createNotificacaoController } from '../controllers/notificacaoController.js'

export async function notificacaoRoutes(app, { notificacaoService }) {
  const controller = createNotificacaoController(notificacaoService)

  app.get('/', controller.list)
  app.get('/nao-lidas/contagem', controller.unreadCount)
  app.patch('/ler-todas', controller.markAllRead)
  app.patch('/:id/ler', controller.markRead)
}
