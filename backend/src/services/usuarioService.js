import argon2 from 'argon2'

import { ARGON2_OPTIONS } from './authService.js'
import { AppError } from '../utils/appError.js'
import { publicUser, validatePassword, validateUsername } from '../utils/authValidation.js'

function notFound() {
  return new AppError({ statusCode: 404, code: 'USUARIO_NAO_ENCONTRADO', message: 'Usuário não encontrado.' })
}

async function passwordHash(password) {
  return argon2.hash(validatePassword(password), ARGON2_OPTIONS)
}

function mapUsernameConflict(error) {
  if (error?.code === 'P2002') {
    throw new AppError({ statusCode: 409, code: 'USERNAME_DUPLICADO', message: 'Já existe um usuário com esse nome.' })
  }
  throw error
}

export function createUsuarioService({ prisma }) {
  async function list() {
    const users = await prisma.usuario.findMany({ orderBy: { username: 'asc' } })
    return { data: users.map(publicUser) }
  }

  async function createViewer({ username: rawUsername, password }) {
    const username = validateUsername(rawUsername)
    const senhaHash = await passwordHash(password)
    try {
      const user = await prisma.usuario.create({
        data: { username, senhaHash, role: 'VISUALIZADOR', adminSlot: null },
      })
      return publicUser(user)
    } catch (error) { return mapUsernameConflict(error) }
  }

  async function setStatus(id, ativo) {
    const user = await prisma.usuario.findUnique({ where: { id } })
    if (!user) throw notFound()
    if (user.role === 'ADMIN') {
      throw new AppError({ statusCode: 403, code: 'OPERACAO_NAO_PERMITIDA', message: 'O administrador não pode ser desativado.' })
    }
    return prisma.$transaction(async (tx) => {
      const updated = await tx.usuario.update({ where: { id }, data: { ativo } })
      if (!ativo) await tx.sessao.deleteMany({ where: { usuarioId: id } })
      return publicUser(updated)
    })
  }

  async function resetPassword(id, password) {
    const user = await prisma.usuario.findUnique({ where: { id } })
    if (!user) throw notFound()
    if (user.role === 'ADMIN') {
      throw new AppError({ statusCode: 403, code: 'OPERACAO_NAO_PERMITIDA', message: 'A senha do administrador não pode ser alterada por esta rota.' })
    }
    const senhaHash = await passwordHash(password)
    return prisma.$transaction(async (tx) => {
      const updated = await tx.usuario.update({ where: { id }, data: { senhaHash } })
      await tx.sessao.deleteMany({ where: { usuarioId: id } })
      return publicUser(updated)
    })
  }

  async function createAdmin({ username: rawUsername, password }) {
    const username = validateUsername(rawUsername)
    const senhaHash = await passwordHash(password)
    try {
      const user = await prisma.usuario.create({
        data: { username, senhaHash, role: 'ADMIN', adminSlot: 1 },
      })
      return publicUser(user)
    } catch (error) {
      if (error?.code === 'P2002') {
        throw new AppError({ statusCode: 409, code: 'ADMIN_EXISTENTE', message: 'O sistema já possui um administrador ou esse usuário já existe.' })
      }
      throw error
    }
  }

  return { createAdmin, createViewer, list, resetPassword, setStatus }
}
