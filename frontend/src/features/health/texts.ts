import type { Tone } from '@/shared/ui/badge'

export const SESSION_TEXT: Record<string, string> = {
  STARTING: 'запуск',
  CONNECTING: 'подключение…',
  WAITING_QR: 'номер не привязан',
  CONNECTED: 'подключено',
  RECONNECTING: 'переподключение…',
  DISCONNECTED: 'нет связи',
  LOGGED_OUT: 'номер не привязан',
  BANNED: 'номер заблокирован',
}

type DispatcherInfo = { text: string; short: string; tone: Tone; hint?: string }

export const DISPATCHER: Record<string, DispatcherInfo> = {
  starting: { text: 'запускается', short: 'запуск', tone: 'info' },
  idle: { text: 'ждёт заявок', short: 'ждёт заявок', tone: 'info' },
  running: { text: 'идёт рассылка', short: 'идёт рассылка', tone: 'ok' },
  paused: { text: 'на паузе', short: 'на паузе', tone: 'warn' },
  'outside-window': { text: 'вне рабочего окна', short: 'вне рабочего окна', tone: 'info', hint: 'Продолжится, когда откроется рабочее окно' },
  'daily-limit-reached': { text: 'дневной лимит исчерпан', short: 'дневной лимит', tone: 'info', hint: 'Продолжится завтра' },
  'hourly-limit-reached': { text: 'лимит в час исчерпан', short: 'лимит в час', tone: 'info', hint: 'Продолжится в течение часа' },
  'waiting-groups': {
    text: 'ждёт: в оставшиеся группы недавно писали или там никто не ответил',
    short: 'пауза в группах',
    tone: 'info',
    hint: 'В группу пишем не чаще раза в интервал и только после чужого сообщения — отправим, когда условие выполнится',
  },
  'waiting-session': { text: 'ждёт подключения', short: 'подключение…', tone: 'warn' },
  'no-active-groups': { text: 'нет групп для рассылки', short: 'нет групп', tone: 'warn' },
  'stopped-by-risk': { text: 'остановлена по риску', short: 'остановлена', tone: 'bad' },
  stopped: { text: 'остановлена', short: 'остановлена', tone: 'bad' },
}

export function dispatcherInfo(state: string): DispatcherInfo {
  return DISPATCHER[state] ?? { text: state, short: state, tone: 'info' }
}

export function sessionTone(session: string | undefined): Tone {
  if (session === 'CONNECTED') return 'ok'
  if (session === 'WAITING_QR' || session === 'LOGGED_OUT' || session === 'BANNED') return 'bad'
  return 'warn'
}
