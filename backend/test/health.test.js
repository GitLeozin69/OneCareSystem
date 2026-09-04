import assert from 'node:assert/strict'
import test from 'node:test'

import { buildApp } from '../src/app.js'

test('GET /health informa que o backend está disponível', async (context) => {
  const app = buildApp()
  context.after(() => app.close())

  const response = await app.inject({
    method: 'GET',
    url: '/health',
  })

  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), { status: 'ok' })
})
