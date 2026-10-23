import { describe, expect, it } from 'vitest'
import { dispatchControl, groupPaceText } from './model'
import type { Settings } from '@/shared/api/types'

describe('карточка «Рассылка»', () => {
  it('одна кнопка под состояние', () => {
    expect(dispatchControl('running')).toMatchObject({ badge: 'Работает · идёт рассылка', action: 'pause' })
    expect(dispatchControl('outside-window')).toMatchObject({ badge: 'Работает · вне рабочего окна', action: 'pause' })
    expect(dispatchControl('paused')).toMatchObject({ badge: 'На паузе', action: 'resume', label: 'Возобновить' })
  })

  it('после остановки по риску просит проверить телефон', () => {
    const c = dispatchControl('stopped-by-risk')
    expect(c).toMatchObject({ tone: 'bad', action: 'resume' })
    expect(c.confirm).toBeTruthy()
  })
})

describe('правило для группы', () => {
  it('словами', () => {
    expect(groupPaceText({ groupIntervalMinutes: 60, waitForReply: true } as Settings)).toBe('не чаще раза в 60 мин, после чужого сообщения')
    expect(groupPaceText({ groupIntervalMinutes: 0, waitForReply: false } as Settings)).toBe('без ограничения по времени')
  })
})
