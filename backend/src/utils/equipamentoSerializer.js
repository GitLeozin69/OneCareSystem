function serializeDate(value) {
  return value ? value.toISOString().slice(0, 10) : null
}

function serializeDateTime(value) {
  return value ? value.toISOString() : null
}

export function serializeEquipamento(equipamento) {
  return {
    ...equipamento,
    dataInicioOnecare: serializeDate(equipamento.dataInicioOnecare),
    dataFimOnecare: serializeDate(equipamento.dataFimOnecare),
    dataUltimaConferencia: serializeDate(
      equipamento.dataUltimaConferencia,
    ),
    arquivadoEm: serializeDateTime(equipamento.arquivadoEm),
    createdAt: serializeDateTime(equipamento.createdAt),
    updatedAt: serializeDateTime(equipamento.updatedAt),
  }
}
