import {
  createOnecareReference,
  formatOnecareGeneratedAt,
  onecareStatusWhere,
  withOnecareStatus,
} from '../utils/onecareStatus.js'

const dashboardFields = {
  id: true,
  serialNumber: true,
  partNumber: true,
  cliente: true,
  distribuidor: true,
  contratoOnecare: true,
  dataFimOnecare: true,
}

export function createDashboardService({ prisma, clock = () => new Date() }) {
  return {
    async summary() {
      const now = clock()
      const reference = createOnecareReference(now)
      const operational = { arquivado: false }
      const statusWhere = (status) => ({
        ...operational,
        dataFimOnecare: onecareStatusWhere(status, reference),
      })

      const [
        totalEquipamentos,
        onecareAtivo,
        onecareVencendo,
        onecareVencido,
        arquivados,
        proximosVencimentos,
        vencidosRecentes,
      ] = await prisma.$transaction((transaction) => Promise.all([
        transaction.equipamento.count({ where: operational }),
        transaction.equipamento.count({ where: statusWhere('ATIVO') }),
        transaction.equipamento.count({ where: statusWhere('VENCENDO') }),
        transaction.equipamento.count({ where: statusWhere('VENCIDO') }),
        transaction.equipamento.count({ where: { arquivado: true } }),
        transaction.equipamento.findMany({
          where: statusWhere('VENCENDO'),
          orderBy: [{ dataFimOnecare: 'asc' }, { id: 'asc' }],
          take: 10,
          select: dashboardFields,
        }),
        transaction.equipamento.findMany({
          where: statusWhere('VENCIDO'),
          orderBy: [{ dataFimOnecare: 'desc' }, { id: 'desc' }],
          take: 10,
          select: dashboardFields,
        }),
      ]))
      const semDataTermino = totalEquipamentos - onecareAtivo -
        onecareVencendo - onecareVencido

      return {
        generatedAt: formatOnecareGeneratedAt(now),
        totals: {
          totalEquipamentos,
          onecareAtivo,
          onecareVencendo,
          onecareVencido,
          semDataTermino,
          arquivados,
        },
        proximosVencimentos: proximosVencimentos.map((item) =>
          withOnecareStatus(item, reference)),
        vencidosRecentes: vencidosRecentes.map((item) =>
          withOnecareStatus(item, reference)),
      }
    },
  }
}
