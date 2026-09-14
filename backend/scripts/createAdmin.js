import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'

import { createPrismaClient } from '../src/lib/prisma.js'
import { createUsuarioService } from '../src/services/usuarioService.js'

function readSecret(prompt) {
  if (!stdin.isTTY || !stdout.isTTY || typeof stdin.setRawMode !== 'function') {
    throw new Error('Execute este comando em um terminal interativo para informar a senha com segurança.')
  }
  stdout.write(prompt)
  stdin.setRawMode(true)
  stdin.resume()
  stdin.setEncoding('utf8')
  return new Promise((resolve, reject) => {
    let value = ''
    function finish(error) {
      stdin.setRawMode(false)
      stdin.pause()
      stdin.off('data', onData)
      stdout.write('\n')
      if (error) reject(error)
      else resolve(value)
    }
    function onData(character) {
      if (character === '\u0003') return finish(new Error('Operação cancelada.'))
      if (character === '\r' || character === '\n') return finish()
      if (character === '\u007f' || character === '\b') value = value.slice(0, -1)
      else if (!character.startsWith('\u001b')) value += character
    }
    stdin.on('data', onData)
  })
}

const prisma = createPrismaClient()
const reader = createInterface({ input: stdin, output: stdout })
try {
  const username = await reader.question('Usuário do administrador: ')
  reader.close()
  const password = await readSecret('Senha (8 a 128 caracteres): ')
  const confirmation = await readSecret('Confirme a senha: ')
  if (password !== confirmation) throw new Error('As senhas não coincidem.')
  const user = await createUsuarioService({ prisma }).createAdmin({ username, password })
  stdout.write(`Administrador ${user.username} criado com sucesso.\n`)
} catch (error) {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 1
} finally {
  reader.close()
  await prisma.$disconnect()
}
