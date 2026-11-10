import { describe, expect, it } from 'vitest'
import { campaignState, dayRuns, loadWarnings, SEND_SECONDS, matchesFilter, runsText, scheduleShort, scheduleText, waitingShort, whereText } from './model'
import type { Campaign, Run } from '@/shared/api/types'
import { groupsCount } from '@/shared/lib/format'

const SECONDS_PER_HOUR = 3600

const run = (over: Partial<Run> = {}): Run => ({
  id: '5',
  status: 'QUEUED',
  error: null,
  queuedAt: '2026-10-22T07:31:00Z',
  startedAt: null,
  completedAt: null,
  progress: { total: 0, sent: 0, failed: 0, skipped: 0, pending: 0 },
  waiting: null,
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
  extraTimes: [],
  anyTime: false,
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
  })

  it('фильтр «Идут» — рассылаются и в очереди', () => {
    expect(matchesFilter(campaign(), 'active')).toBe(true)
    expect(matchesFilter(campaign({ current: null, nextRunAt: '2026-10-23T00:00:00Z' }), 'active')).toBe(false)
    expect(matchesFilter(campaign({ current: null, nextRunAt: '2026-10-23T00:00:00Z' }), 'scheduled')).toBe(true)
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
    expect(scheduleShort({ repeatMode: 'INTERVAL', startTime: '08:00', endTime: '23:00', intervalMinutes: 120 })).toBe('каждые 2 ч, 08:00–23:00')
    expect(scheduleShort({ repeatMode: 'DAILY', startTime: '05:00', endTime: null, intervalMinutes: null })).toBe('ежедневно 05:00')
  })
})

describe('запуски за день', () => {
  const hourly = { repeatMode: 'INTERVAL' as const, startTime: '08:00', endTime: '23:00', intervalMinutes: 60, extraTimes: ['05:00'] }

  it('каждый час с 08:00 до 23:00 и ещё в 05:00 — 17 запусков', () => {
    const runs = dayRuns(hourly, '23:00')
    expect(runs).toHaveLength(17)
    expect(runs[0]).toBe('05:00')
    expect(runsText(runs)).toBe('05:00, 08:00, 09:00 … 23:00 — 17 запусков в день')
    expect(dayRuns({ repeatMode: 'DAILY', startTime: '09:00', endTime: null, intervalMinutes: null, extraTimes: ['05:00', '09:00'] }, '23:00')).toEqual(['05:00', '09:00'])
  })

  it('доп. время видно в расписании', () => {
    expect(scheduleShort(hourly)).toBe('каждый час, 08:00–23:00 + 05:00')
    expect(scheduleText({ ...hourly, anyTime: true })).toBe('каждый час с 08:00 до 23:00 и в 05:00, в том числе вне рабочего окна')
  })

  const ROLLOVER = ', а следующий запуск наступает раньше. Тогда прошлая рассылка останавливается, оставшиеся группы получают отметку «перенесено в следующий запуск», а новая рассылка начинается с первой группы.'
  const PROD_PAUSE = { groupPauseMinSeconds: 1.5, groupPauseMaxSeconds: 2.5 }
  const NO_LIMIT = 0
  const HOURLY_LIMIT = 120
  const DAILY_LIMIT = 900

  it('предупреждает, когда лимиты не дадут разослать столько раз', () => {
    const warnings = loadWarnings({ times: dayRuns(hourly, '23:00'), groups: 263, hourlyLimit: HOURLY_LIMIT, dailyLimit: DAILY_LIMIT, ...PROD_PAUSE })
    expect(warnings).toEqual([
      `Одна рассылка на 263 группы идёт ≈ 2,2 ч (лимит ${HOURLY_LIMIT} в час)${ROLLOVER}`,
      `Дневного лимита ${DAILY_LIMIT} хватит на 3 полные рассылки из 17.`,
    ])
    expect(loadWarnings({ times: ['05:00', '08:00'], groups: 20, hourlyLimit: HOURLY_LIMIT, dailyLimit: DAILY_LIMIT, ...PROD_PAUSE })).toEqual([])
  })

  it('без часового лимита считает длительность по паузе между группами', () => {
    const times = dayRuns(hourly, '23:00')
    expect(loadWarnings({ times, groups: 2000, hourlyLimit: NO_LIMIT, dailyLimit: NO_LIMIT, ...PROD_PAUSE })).toEqual([`Одна рассылка на 2000 групп идёт ≈ 1,1 ч${ROLLOVER}`])
    expect(loadWarnings({ times, groups: 263, hourlyLimit: NO_LIMIT, dailyLimit: NO_LIMIT, ...PROD_PAUSE })).toEqual([])
    expect(loadWarnings({ times: ['08:00', '08:05'], groups: 263, hourlyLimit: NO_LIMIT, dailyLimit: NO_LIMIT, ...PROD_PAUSE })).toEqual([`Одна рассылка на 263 группы идёт ≈ 9 минут${ROLLOVER}`])
  })

  it('пауза короче отправки не ускоряет рассылку', () => {
    const fast = { groupPauseMinSeconds: 0, groupPauseMaxSeconds: 0 }
    const groups = Math.ceil(SECONDS_PER_HOUR / SEND_SECONDS) + 1
    expect(loadWarnings({ times: ['08:00', '09:00'], groups, hourlyLimit: NO_LIMIT, dailyLimit: NO_LIMIT, ...fast })).toEqual([`Одна рассылка на ${groupsCount(groups)} идёт ≈ 1 ч${ROLLOVER}`])
  })
})

describe('почему рассылка ждёт', () => {
  it('в таблице — коротко, без подсказки', () => {
    expect(waitingShort(run({ waiting: 'ждёт рабочего окна с 08:00 — чтобы отправить сейчас, включите в заявке «слать и вне рабочего окна»' }))).toBe('ждёт рабочего окна с 08:00')
    expect(waitingShort(run())).toBeNull()
  })
})
