function serializeDate(value) {
  return value ? value.toISOString().slice(0, 10) : null
}

function serializeContract(contract) {
  return {
    contratoOnecare: contract.contratoOnecare,
    dataInicioOnecare: serializeDate(contract.dataInicioOnecare),
    dataFimOnecare: serializeDate(contract.dataFimOnecare),
  }
}

export function serializeHistoricoContrato(historico) {
  return {
    id: historico.id,
    anterior: serializeContract(historico.anterior),
    novo: serializeContract(historico.novo),
    substituidoEm: historico.substituidoEm.toISOString(),
  }
}
