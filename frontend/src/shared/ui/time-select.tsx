import * as Dropdown from '@radix-ui/react-dropdown-menu'
import { ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/shared/lib/cn'
import { control } from './styles'

const MINUTE_STEP = 5
const STEPS = Array.from({ length: (24 * 60) / MINUTE_STEP }, (_, i) => {
  const minutes = i * MINUTE_STEP
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
})

function centerChecked(menu: HTMLElement) {
  const item = menu.querySelector<HTMLElement>('[data-state="checked"]')
  if (item) menu.scrollTop = item.offsetTop - (menu.clientHeight - item.offsetHeight) / 2
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
  const times = STEPS.includes(value) ? STEPS : [...STEPS, value].sort()
  const [open, setOpen] = useState(false)
  const menu = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => menu.current && centerChecked(menu.current))
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
          className="z-[60] max-h-[min(280px,var(--radix-dropdown-menu-content-available-height))] w-[var(--radix-dropdown-menu-trigger-width)] min-w-24 overflow-y-auto overscroll-contain rounded-xl border border-border bg-surface p-1 shadow-xl"
        >
          <Dropdown.RadioGroup value={value} onValueChange={onChange}>
            {times.map((time) => (
              <Dropdown.RadioItem
                key={time}
                value={time}
                className="flex min-h-9 cursor-pointer items-center rounded-lg px-2.5 text-sm tabular-nums outline-none select-none data-[highlighted]:bg-surface-2 data-[state=checked]:bg-accent-soft data-[state=checked]:font-semibold"
              >
                {time}
              </Dropdown.RadioItem>
            ))}
          </Dropdown.RadioGroup>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  )
}
