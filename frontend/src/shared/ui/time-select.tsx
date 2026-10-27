import { cn } from '@/shared/lib/cn'
import { Select } from './input'

const MINUTE_STEP = 5
const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'))
const MINUTES = Array.from({ length: 60 / MINUTE_STEP }, (_, i) => String(i * MINUTE_STEP).padStart(2, '0'))

export function TimeSelect({
  value,
  onChange,
  label,
  invalid,
  className,
}: {
  value: string
  onChange: (value: string) => void
  label: string
  invalid?: boolean
  className?: string
}) {
  const [hour = '08', minute = '00'] = value.split(':')
  const minutes = MINUTES.includes(minute) ? MINUTES : [...MINUTES, minute].sort()
  const select = cn('py-1.5 pr-7 pl-2 text-sm tabular-nums', className)

  return (
    <span role="group" aria-label={label} className="inline-flex items-center gap-0.5">
      <Select className={select} aria-label={`${label}: часы`} aria-invalid={invalid} value={hour} onChange={(e) => onChange(`${e.target.value}:${minute}`)}>
        {HOURS.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </Select>
      <span className="text-muted">:</span>
      <Select className={select} aria-label={`${label}: минуты`} aria-invalid={invalid} value={minute} onChange={(e) => onChange(`${hour}:${e.target.value}`)}>
        {minutes.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </Select>
    </span>
  )
}
