import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

test('worker le planilha e preserva erros no modo node --watch', { timeout: 30000 }, async () => {
  const child = spawn(process.execPath, ['--watch', '--watch-preserve-output',
    fileURLToPath(new URL('./helpers/excelWatchRunner.js', import.meta.url))], { windowsHide: true })
  let output = ''
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`Watch nao concluiu: ${output}`))
    }, 25000)
    const collect = (chunk) => {
      output += chunk.toString()
      // O programa ja encerrou; resta apenas o supervisor do watch.
      if (/Completed running|Failed running/.test(output)) child.kill()
    }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    child.once('error', (error) => { clearTimeout(timer); reject(error) })
    child.once('close', () => { clearTimeout(timer); resolve() })
  })
  assert.match(output, /EXCEL_WATCH_OK/)
  assert.doesNotMatch(output, /Failed running/)
})
