export class AppError extends Error {
  constructor({ statusCode, code, message, details = [], retryAfterSeconds }) {
    super(message)
    this.name = 'AppError'
    this.statusCode = statusCode
    this.code = code
    this.details = details
    this.retryAfterSeconds = retryAfterSeconds
  }
}
