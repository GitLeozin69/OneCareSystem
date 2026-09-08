import { AppError } from './appError.js'

export function duplicateSerialError() {
  return new AppError({
    statusCode: 409,
    code: 'SERIAL_DUPLICADO',
    message: 'Equipamento com esse número de série já existe.',
  })
}

export function duplicatePatrimonioError() {
  return new AppError({
    statusCode: 409,
    code: 'PATRIMONIO_DUPLICADO',
    message: 'Já existe um equipamento com esse patrimônio.',
  })
}

export function fromUniqueConstraintError(error) {
  if (error?.code !== 'P2002') return null

  // Prisma pode identificar o conflito pelo campo ou pelo índice do driver.
  const constraint = error.meta?.driverAdapterError?.cause?.constraint
  const targets = [error.meta?.target, constraint?.index, constraint?.fields]
    .flat()
    .filter((target) => typeof target === 'string')
    .map((target) => target.split('.').at(-1))

  if (targets.some((target) => [
    'patrimonio', 'uq_equipamentos_patrimonio',
  ].includes(target))) {
    return duplicatePatrimonioError()
  }

  if (targets.some((target) => [
    'serialNumber', 'serial_number', 'uq_equipamentos_serial_number',
  ].includes(target))) {
    return duplicateSerialError()
  }

  return null
}
