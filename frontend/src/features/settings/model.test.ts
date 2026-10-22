import { describe, expect, it } from 'vitest'
import { dispatchControl } from './model'

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
