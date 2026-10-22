import { useFormContext, useWatch } from 'react-hook-form'
import type { FormValues } from '../form'
import { intervalText } from '@/shared/lib/format'
import { Caption, Checkbox, Input, Select } from '@/shared/ui/input'
import { Segmented } from '@/shared/ui/segmented'

const INTERVALS = [60, 90, 120, 180, 240]
const time = 'w-auto px-2 py-1.5 text-sm'

export function WhenPicker() {
  const { register, setValue, control, formState } = useFormContext<FormValues>()
  const [repeat, intervalMinutes] = useWatch({ control, name: ['repeat', 'intervalMinutes'] })

  return (
    <div className="grid gap-1.5">
      <Caption>Когда</Caption>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          value={repeat}
          onChange={(v) => setValue('repeat', v)}
          options={[
            { value: 'now', label: 'Сейчас' },
            { value: 'at', label: 'В время' },
            { value: 'daily', label: 'Ежедневно' },
            { value: 'interval', label: 'Повтор' },
          ]}
        />
        {repeat === 'at' && <Input type="time" className={time} aria-label="Время" {...register('atTime')} />}
        {repeat === 'daily' && <Input type="time" className={time} aria-label="Время" {...register('dailyTime')} />}
        {repeat === 'interval' && (
          <span className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
            <Select className="py-1.5 text-sm" aria-label="Как часто" {...register('intervalMinutes', { valueAsNumber: true })}>
              {[...new Set([...INTERVALS, intervalMinutes])].sort((a, b) => a - b).map((m) => (
                <option key={m} value={m}>
                  {intervalText(m)}
                </option>
              ))}
            </Select>
            с <Input type="time" className={time} aria-label="С" {...register('intervalStart')} />
            до <Input type="time" className={time} aria-label="До" aria-invalid={!!formState.errors.intervalEnd} {...register('intervalEnd')} />
          </span>
        )}
      </div>
      {(repeat === 'daily' || repeat === 'interval') && <Checkbox className="text-[13px]" label="первую рассылку — сразу" {...register('sendNow')} />}
      {formState.errors.intervalEnd && <span className="text-[13px] text-danger">{formState.errors.intervalEnd.message}</span>}
    </div>
  )
}
