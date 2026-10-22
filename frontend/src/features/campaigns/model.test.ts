import { describe, expect, it } from 'vitest'
import { campaignState, metaLine, scheduleText, whereText } from './model'
import type { Campaign, Run } from '@/shared/api/types'

const run = (over: Partial<Run> = {}): Run => ({
  id: '5',
  status: 'QUEUED',
  error: null,
  queuedAt: '2026-10-22T07:31:00Z',
  startedAt: null,
  completedAt: null,
  progress: { total: 0, sent: 0, failed: 0, skipped: 0, pending: 0 },
  ...over,
})

const campaign = (over: Partial<Campaign> = {}): Campaign => ({
  id: '2',
  title: 'АЛМАТЫ → АСТАНА',
  message: '',
  form: null,
  targeted: true,
  targetLabel: 'Тест',
  targets: [{ jid: '1@g.us', name: 'Группа 1' }],
  repeatMode: 'ONCE',
  startTime: null,
  endTime: null,
  intervalMinutes: null,
  enabled: true,
  createdAt: '2026-10-21T17:07:00Z',
  updatedAt: '2026-10-21T17:07:00Z',
  nextRunAt: null,
  lastRunAt: null,
  current: run(),
  runCount: 1,
  runs: [run()],
  ...over,
})

describe('заявка в списке', () => {
  it('показывает название списка групп, а не «1 группа»', () => {
    expect(whereText(campaign())).toBe('Тест')
    expect(metaLine(campaign())).toBe('ещё не начата · Тест · один раз · создана 21.10, 22:07')
  })

  it('без названия списка — число групп, без адресатов — все активные', () => {
    expect(whereText(campaign({ targetLabel: null }))).toBe('1 группа')
    expect(whereText(campaign({ targeted: false }))).toBe('все активные группы')
  })

  it('состояние по текущей рассылке и расписанию', () => {
    expect(campaignState(campaign())).toBe('waiting')
    expect(campaignState(campaign({ current: run({ status: 'SENDING' }) }))).toBe('sending')
    expect(campaignState(campaign({ current: null, enabled: false, lastRunAt: '2026-10-21T17:07:00Z' }))).toBe('done')
    expect(campaignState(campaign({ current: null, repeatMode: 'DAILY', enabled: false }))).toBe('off')
    expect(campaignState(campaign({ current: null, nextRunAt: '2026-10-23T00:00:00Z' }))).toBe('scheduled')
  })

  it('расписание словами', () => {
    expect(scheduleText({ repeatMode: 'DAILY', startTime: '05:00', endTime: null, intervalMinutes: null })).toBe('каждый день в 05:00')
    expect(scheduleText({ repeatMode: 'INTERVAL', startTime: '08:00', endTime: '23:00', intervalMinutes: 120 })).toBe('каждые 2 часа с 08:00 до 23:00')
    expect(scheduleText({ repeatMode: 'INTERVAL', startTime: '08:00', endTime: null, intervalMinutes: 90 }, '20:00')).toBe('каждые 1,5 часа с 08:00 до 20:00')
  })
})
