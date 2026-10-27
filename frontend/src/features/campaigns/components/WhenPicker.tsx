import { Plus, X } from 'lucide-react'
import { Controller, useFormContext, useWatch, type FieldPath } from 'react-hook-form'
import { repeats, type FormValues } from '../form'
import { dayRuns, loadWarnings, runsText } from '../model'
import { useSettings } from '@/features/settings/api'
import { cn } from '@/shared/lib/cn'
import { intervalText } from '@/shared/lib/format'
import { Caption, Checkbox, Select } from '@/shared/ui/input'
import { Segmented } from '@/shared/ui/segmented'
import { TimeSelect } from '@/shared/ui/time-select'
import { toneSurface } from '@/shared/ui/tone'

const INTERVALS = [60, 90, 120, 180, 240]
const MAX_EXTRA = 3

function ExtraTimes() {
  const { setValue, control, formState } = useFormContext<FormValues>()
  const extra = useWatch({ control, name: 'extraTimes' })
  const set = (next: string[]) => setValue('extraTimes', next, { shouldDirty: true, shouldValidate: formState.isSubmitted })
  const suggest = ['05:00', '06:00', '07:00', '23:30'].find((t) => !extra.includes(t)) ?? '05:00'

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
      ещё в
      {extra.map((value, i) => (
        <span key={i} className="inline-flex items-center rounded-lg border border-border bg-surface-2 pr-1">
          <TimeSelect className="border-0 bg-transparent" label={`Доп. время ${i + 1}`} value={value} onChange={(next) => set(extra.with(i, next))} />
          <button type="button" aria-label="Убрать время" className="cursor-pointer rounded p-0.5 hover:text-danger" onClick={() => set(extra.filter((_, j) => j !== i))}>
            <X className="size-3.5" />
          </button>
        </span>
      ))}
      {extra.length < MAX_EXTRA && (
        <button type="button" onClick={() => set([...extra, suggest])} className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-dashed border-border px-2 py-1 text-[13px] text-accent hover:bg-surface-2">
          <Plus className="size-3.5" />
          {extra.length ? 'время' : `${suggest}, например`}
        </button>
      )}
    </div>
  )
}

function FormTime({ name, label, invalid }: { name: FieldPath<FormValues>; label: string; invalid?: boolean }) {
  const { control } = useFormContext<FormValues>()
  return <Controller control={control} name={name} render={({ field }) => <TimeSelect label={label} invalid={invalid} value={String(field.value)} onChange={field.onChange} />} />
}

export function WhenPicker({ groups }: { groups: number }) {
  const { register, setValue, control, formState } = useFormContext<FormValues>()
  const values = useWatch({ control }) as FormValues
  const { data: settings } = useSettings()
  const windowEnd = settings?.windowEnd ?? '23:00'
  const windowText = settings ? `${settings.windowStart}–${settings.windowEnd}` : 'рабочего окна'

  const times = repeats(values.repeat)
    ? dayRuns(
        values.repeat === 'daily'
          ? { repeatMode: 'DAILY', startTime: values.dailyTime, endTime: null, intervalMinutes: null, extraTimes: values.extraTimes }
          : { repeatMode: 'INTERVAL', startTime: values.intervalStart, endTime: values.intervalEnd, intervalMinutes: values.intervalMinutes, extraTimes: values.extraTimes },
        windowEnd,
      )
    : []
  const warnings = settings ? loadWarnings({ times, groups, hourlyLimit: settings.hourlyLimit, dailyLimit: settings.dailyLimit }) : []
  const lateExtra = !values.anyTime && values.extraTimes.some((t) => t >= (values.repeat === 'interval' ? values.intervalEnd : windowEnd))
  const errors = [formState.errors.intervalEnd?.message, formState.errors.extraTimes?.message].filter(Boolean)

  return (
    <div className="grid gap-1.5">
      <Caption>Когда</Caption>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          value={values.repeat}
          onChange={(v) => setValue('repeat', v)}
          options={[
            { value: 'now', label: 'Сейчас' },
            { value: 'at', label: 'Один раз' },
            { value: 'daily', label: 'Ежедневно' },
            { value: 'interval', label: 'Повтор' },
          ]}
        />
        {values.repeat === 'at' && <FormTime name="atTime" label="Время" />}
        {values.repeat === 'daily' && <FormTime name="dailyTime" label="Время" />}
        {values.repeat === 'interval' && (
          <span className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
            <Select className="py-1.5 text-sm" aria-label="Как часто" {...register('intervalMinutes', { valueAsNumber: true })}>
              {[...new Set([...INTERVALS, values.intervalMinutes])].sort((a, b) => a - b).map((m) => (
                <option key={m} value={m}>
                  {intervalText(m)}
                </option>
              ))}
            </Select>
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              с <FormTime name="intervalStart" label="С" />
            </span>
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              до <FormTime name="intervalEnd" label="До" invalid={!!formState.errors.intervalEnd} />
            </span>
          </span>
        )}
      </div>
      {repeats(values.repeat) && (
        <>
          <ExtraTimes />
          <p className="text-[13px] text-muted">{runsText(times)}</p>
          {warnings.map((w) => (
            <p key={w} className={cn('rounded-lg px-2.5 py-1.5 text-[13px]', toneSurface.warn)}>
              {w}
            </p>
          ))}
        </>
      )}
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        {repeats(values.repeat) && <Checkbox className="text-[13px]" label="первую рассылку — сразу" {...register('sendNow')} />}
        <Checkbox className="text-[13px]" label={`слать и вне рабочего окна (${windowText})`} {...register('anyTime')} />
      </div>
      {lateExtra && <span className="text-[13px] text-warn-text">Время после конца окна — включите «слать и вне рабочего окна», иначе заявка не сохранится.</span>}
      {errors.map((e) => (
        <span key={e} className="text-[13px] text-danger">
          {e}
        </span>
      ))}
    </div>
  )
}
