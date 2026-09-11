import { createNotificacaoController } from '../controllers/notificacaoController.js'

export async function notificacaoRoutes(app, { notificacaoService }) {
  const controller = createNotificacaoController(notificacaoService)

  const adminOnly = { config: { access: 'ADMIN' } }
  app.get('/', adminOnly, controller.list)
  app.get('/nao-lidas/contagem', adminOnly, controller.unreadCount)
  app.patch('/ler-todas', adminOnly, controller.markAllRead)
  app.patch('/:id/ler', adminOnly, controller.markRead)
}
