import { serializeEquipamento } from '../utils/equipamentoSerializer.js'

function serializeDashboardItem(item) {
  const serialized = serializeEquipamento(item)
  return {
    id: serialized.id,
    serialNumber: serialized.serialNumber,
    partNumber: serialized.partNumber,
    cliente: serialized.cliente,
    distribuidor: serialized.distribuidor,
    contratoOnecare: serialized.contratoOnecare,
    dataFimOnecare: serialized.dataFimOnecare,
    statusOnecare: serialized.statusOnecare,
    diasRestantes: serialized.diasRestantes,
  }
}

export function createDashboardController(dashboardService) {
  return {
    async summary() {
      const result = await dashboardService.summary()
      return {
        ...result,
        proximosVencimentos: result.proximosVencimentos.map(serializeDashboardItem),
        vencidosRecentes: result.vencidosRecentes.map(serializeDashboardItem),
      }
    },
  }
}
