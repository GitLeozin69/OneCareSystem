import { ONECARE_TIME_ZONE } from '../utils/onecareStatus.js'

const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: ONECARE_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

export function millisecondsUntilNextRun(now = new Date()) {
  const parts = Object.fromEntries(
    formatter.formatToParts(now)
      .filter(({ type }) => ['hour', 'minute', 'second'].includes(type))
      .map(({ type, value }) => [type, Number(value)]),
  )
  const elapsed = ((parts.hour * 60 + parts.minute) * 60 + parts.second) * 1000
    + now.getMilliseconds()
  const target = 8 * 60 * 60 * 1000
  return elapsed < target ? target - elapsed : 24 * 60 * 60 * 1000 - elapsed + target
}

export function startNotificacaoScheduler({ run, onError = () => {}, clock = () => new Date(),
  setTimer = setTimeout, clearTimer = clearTimeout }) {
  let stopped = false
  let timer

  function schedule() {
    if (stopped) return
    timer = setTimer(async () => {
      try {
        await run()
      } catch (error) {
        onError(error)
      } finally {
        schedule()
      }
    }, millisecondsUntilNextRun(clock()))
    timer?.unref?.()
  }

  schedule()
  return () => {
    stopped = true
    if (timer !== undefined) clearTimer(timer)
  }
}
