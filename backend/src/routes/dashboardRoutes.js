import { createDashboardController } from '../controllers/dashboardController.js'

export async function dashboardRoutes(app, options) {
  const controller = createDashboardController(options.dashboardService)
  app.get('/resumo', controller.summary)
}
