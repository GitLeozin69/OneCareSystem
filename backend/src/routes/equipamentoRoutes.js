import { createEquipamentoController } from '../controllers/equipamentoController.js'

const nullableString = {
  anyOf: [{ type: 'string' }, { type: 'null' }],
}

const nullableDate = {
  anyOf: [{ type: 'string' }, { type: 'null' }],
}

const equipamentoProperties = {
  serialNumber: { type: 'string' },
  partNumber: { type: 'string' },
  cliente: { type: 'string' },
  patrimonio: nullableString,
  contratoOnecare: nullableString,
  dataInicioOnecare: { type: 'string' },
  dataFimOnecare: { type: 'string' },
  dataUltimaConferencia: nullableDate,
}

const idParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: {
    id: {
      type: 'string',
      pattern: '^[1-9][0-9]*$',
    },
  },
}

export async function equipamentoRoutes(app, options) {
  const controller = createEquipamentoController(options.equipamentoService)

  app.get('/', controller.list)

  app.post(
    '/',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: [
            'serialNumber',
            'partNumber',
            'cliente',
            'dataInicioOnecare',
            'dataFimOnecare',
          ],
          properties: equipamentoProperties,
        },
      },
    },
    controller.create,
  )

  app.get('/arquivados', controller.listArchived)

  app.get(
    '/:id/historico-contratos',
    { schema: { params: idParamsSchema } },
    controller.listContractHistory,
  )

  app.get(
    '/:id',
    { schema: { params: idParamsSchema } },
    controller.findById,
  )

  app.patch(
    '/:id',
    {
      schema: {
        params: idParamsSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          minProperties: 1,
          properties: equipamentoProperties,
        },
      },
    },
    controller.update,
  )

  app.delete(
    '/:id',
    { schema: { params: idParamsSchema } },
    controller.archive,
  )

  app.patch(
    '/:id/restaurar',
    { schema: { params: idParamsSchema } },
    controller.restore,
  )
}
