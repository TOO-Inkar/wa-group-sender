import * as Dropdown from '@radix-ui/react-dropdown-menu'
import { ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/shared/lib/cn'
import { control } from './styles'

const MINUTE_STEP = 5
const pad = (n: number) => String(n).padStart(2, '0')
const HOURS = Array.from({ length: 24 }, (_, h) => pad(h))
const MINUTES = Array.from({ length: 60 / MINUTE_STEP }, (_, i) => pad(i * MINUTE_STEP))

function centerChecked(column: HTMLElement) {
  const item = column.querySelector<HTMLElement>('[data-state="checked"]')
  if (item) column.scrollTop = item.offsetTop - (column.clientHeight - item.offsetHeight) / 2
}

function Column({ label, values, value, onPick, keepOpen }: { label: string; values: string[]; value: string; onPick: (value: string) => void; keepOpen?: boolean }) {
  return (
    <Dropdown.RadioGroup
      aria-label={label}
      value={value}
      onValueChange={onPick}
      data-time-column
      className="max-h-[min(240px,calc(var(--radix-dropdown-menu-content-available-height)-16px))] overflow-y-auto overscroll-contain"
    >
      {values.map((v) => (
        <Dropdown.RadioItem
          key={v}
          value={v}
          onSelect={keepOpen ? (e) => e.preventDefault() : undefined}
          className="flex min-h-9 cursor-pointer items-center justify-center rounded-lg text-sm tabular-nums outline-none select-none data-[highlighted]:bg-surface-2 data-[state=checked]:bg-accent-soft data-[state=checked]:font-semibold"
        >
          {v}
        </Dropdown.RadioItem>
      ))}
    </Dropdown.RadioGroup>
  )
}

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
  const [open, setOpen] = useState(false)
  const menu = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => menu.current?.querySelectorAll<HTMLElement>('[data-time-column]').forEach(centerChecked))
    return () => cancelAnimationFrame(frame)
  }, [open])

  return (
    <Dropdown.Root open={open} onOpenChange={setOpen}>
      <Dropdown.Trigger aria-label={label} aria-invalid={invalid} className={cn(control, 'inline-flex w-24 cursor-pointer items-center justify-between gap-1 tabular-nums', className)}>
        {value}
        <ChevronDown size={16} className="shrink-0 text-muted" aria-hidden />
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          ref={menu}
          align="start"
          sideOffset={4}
          collisionPadding={8}
          aria-label={label}
          className="z-[60] grid w-40 grid-cols-2 gap-1 rounded-xl border border-border bg-surface p-1 shadow-xl"
        >
          <Column label="Часы" values={HOURS} value={hour} onPick={(h) => onChange(`${h}:${minute}`)} keepOpen />
          <Column label="Минуты" values={minutes} value={minute} onPick={(m) => onChange(`${hour}:${m}`)} />
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  )
}
