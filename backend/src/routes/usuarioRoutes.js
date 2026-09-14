const idParams = {
  type: 'object', additionalProperties: false, required: ['id'],
  properties: { id: { type: 'string', pattern: '^[1-9][0-9]*$' } },
}

export async function usuarioRoutes(app, { usuarioService }) {
  app.get('/', { config: { access: 'ADMIN' } }, () => usuarioService.list())
  app.post('/', {
    config: { access: 'ADMIN' },
    schema: {
      body: { type: 'object', additionalProperties: false, required: ['username', 'password'],
        properties: { username: { type: 'string', minLength: 3, maxLength: 50 }, password: { type: 'string', minLength: 8, maxLength: 128 } } },
    },
  }, async (request, reply) => reply.code(201).send(await usuarioService.createViewer(request.body)))
  app.patch('/:id/status', {
    config: { access: 'ADMIN' },
    schema: { params: idParams, body: { type: 'object', additionalProperties: false, required: ['ativo'], properties: { ativo: { type: 'boolean' } } } },
  }, (request) => usuarioService.setStatus(Number(request.params.id), request.body.ativo))
  app.patch('/:id/senha', {
    config: { access: 'ADMIN' },
    schema: { params: idParams, body: { type: 'object', additionalProperties: false, required: ['password'], properties: { password: { type: 'string', minLength: 8, maxLength: 128 } } } },
  }, (request) => usuarioService.resetPassword(Number(request.params.id), request.body.password))
}
