import { useFormContext, useWatch } from 'react-hook-form'
import type { FormValues } from '../form'
import { intervalText } from '@/shared/lib/format'
import { Checkbox, Input, Select } from '@/shared/ui/input'
import { Option, OptionGroup } from './Option'

const INTERVALS = [60, 90, 120, 180, 240]

/** Когда отправлять: сейчас, один раз во время, каждый день, повторять в течение дня. */
export function ScheduleSection({ windowText }: { windowText: string }) {
  const { register, setValue, control, formState } = useFormContext<FormValues>()
  const v = useWatch({ control })
  const pick = (repeat: FormValues['repeat']) => ({ onFocus: () => setValue('repeat', repeat) })
  const time = 'w-auto px-2 py-1'

  let note = ''
  if (v.repeat === 'now') note = `Уйдёт один раз, ${windowText}.`
  if (v.repeat === 'at') note = `Один раз: начнётся в ${v.atTime} (сегодня, если время не прошло, иначе завтра).`
  if (v.repeat === 'daily') note = `${v.sendNow ? 'Первая рассылка — сразу, дальше' : 'Рассылка'} каждый день в ${v.dailyTime} — даже если рабочее окно начинается позже.`
  if (v.repeat === 'interval')
    note = `${v.sendNow ? 'Первая рассылка — сразу, дальше' : 'Рассылка'} ${intervalText(v.intervalMinutes)} с ${v.intervalStart} до ${v.intervalEnd}, каждый день. Если прошлая рассылка не закончилась, повтор пропускается.`

  return (
    <OptionGroup legend="Когда отправлять" error={formState.errors.intervalEnd?.message}>
      <Option name="repeat" value="now" title="Сейчас, один раз">
        по одной группе с паузами
      </Option>
      <Option name="repeat" value="at" title="Один раз в заданное время">
        в <Input type="time" className={time} {...register('atTime')} {...pick('at')} />
      </Option>
      <Option name="repeat" value="daily" title="Каждый день">
        в <Input type="time" className={time} {...register('dailyTime')} {...pick('daily')} />
      </Option>
      <Option name="repeat" value="interval" title="Повторять в течение дня">
        <Select className="py-1" {...register('intervalMinutes', { valueAsNumber: true })} {...pick('interval')}>
          {[...new Set([...INTERVALS, v.intervalMinutes ?? 120])].sort((a, b) => a - b).map((m) => (
            <option key={m} value={m}>
              {intervalText(m)}
            </option>
          ))}
        </Select>
        с <Input type="time" className={time} {...register('intervalStart')} {...pick('interval')} />
        до <Input type="time" className={time} {...register('intervalEnd')} {...pick('interval')} />
      </Option>
      {(v.repeat === 'daily' || v.repeat === 'interval') && <Checkbox label="Первую рассылку начать сразу" {...register('sendNow')} />}
      <p className="text-[13px] text-muted">{note}</p>
    </OptionGroup>
  )
}
