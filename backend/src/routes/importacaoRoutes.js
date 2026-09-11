import multipart from '@fastify/multipart'
import { importacaoError, importLimits } from '../utils/importacaoError.js'

export async function importacaoRoutes(app, { importacaoService, limits = importLimits() }) {
  await app.register(multipart, { limits: { files: 1, fields: 0, parts: 1, fileSize: limits.maxBytes } })
  let running = 0
  for (const [path, method] of [['validar', 'validate'], ['confirmar', 'confirm']]) {
    app.post(`/${path}`, { config: { access: 'ADMIN' }, bodyLimit: limits.maxBytes + 16384 }, async (request, reply) => {
      if (running >= 2) throw importacaoError('IMPORTACAO_OCUPADA', 'Há importações em andamento. Tente novamente em instantes.', 429)
      running++
      try {
        if (!request.isMultipart()) throw importacaoError('FORMATO_INVALIDO', 'Envie o arquivo no campo arquivo usando multipart/form-data.', 415)
        let file
        for await (const part of request.parts()) {
          if (part.type !== 'file' || part.fieldname !== 'arquivo' || file) {
            if (part.type === 'file') part.file.resume()
            throw importacaoError('ARQUIVO_INVALIDO', 'Envie somente um arquivo no campo arquivo.', 400)
          }
          file = { filename: part.filename, buffer: await part.toBuffer() }
        }
        if (!file) throw importacaoError('ARQUIVO_AUSENTE', 'Selecione uma planilha.', 400)
        const result = await importacaoService[method](file)
        return reply.code(method === 'confirm' ? 201 : 200).send(result)
      } catch (error) {
        if (['FST_REQ_FILE_TOO_LARGE', 'FST_ERR_CTP_BODY_TOO_LARGE'].includes(error.code)) {
          throw importacaoError('LIMITE_ARQUIVO', 'O arquivo excede o limite de tamanho.', 413)
        }
        if (error.code?.startsWith('FST_') || error.code === 'ERR_STREAM_PREMATURE_CLOSE' ||
          error.message === 'Unexpected end of multipart data') {
          throw importacaoError('ARQUIVO_INVALIDO', 'Envie somente um arquivo válido no campo arquivo.', 400)
        }
        throw error
      } finally { running-- }
    })
  }
}
