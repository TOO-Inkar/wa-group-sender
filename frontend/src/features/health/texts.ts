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

export const DISPATCHER_TEXT: Record<string, string> = {
  starting: 'запускается',
  idle: 'ждёт заявок',
  running: 'идёт рассылка',
  paused: 'на паузе',
  'outside-window': 'вне рабочего окна',
  'daily-limit-reached': 'дневной лимит исчерпан',
  'hourly-limit-reached': 'лимит в час исчерпан',
  'waiting-groups': 'ждёт: в оставшихся группах последнее сообщение наше',
  'waiting-session': 'ждёт подключения',
  'no-active-groups': 'нет групп для рассылки',
  'stopped-by-risk': 'остановлена по риску',
  stopped: 'остановлена',
}

export function sessionTone(session: string | undefined): Tone {
  if (session === 'CONNECTED') return 'ok'
  if (session === 'WAITING_QR' || session === 'LOGGED_OUT' || session === 'BANNED') return 'bad'
  return 'warn'
}
