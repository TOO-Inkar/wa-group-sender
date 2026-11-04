import * as Dropdown from '@radix-ui/react-dropdown-menu'
import { MoreHorizontal } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'
import { FOCUS_RING, TRANSITION } from './styles'

type MenuItem = { label: string; icon?: ReactNode; onSelect: () => void; disabled?: boolean; danger?: boolean; hidden?: boolean }

export function RowMenu({ items, label = 'Действия', bordered }: { items: MenuItem[]; label?: string; bordered?: boolean }) {
  return (
    <Dropdown.Root modal={false}>
      <Dropdown.Trigger
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'grid shrink-0 cursor-pointer place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-text data-[state=open]:bg-surface-2',
          TRANSITION,
          FOCUS_RING,
          bordered ? 'size-control border border-border bg-surface' : 'size-control-sm',
        )}
      >
        <MoreHorizontal size={18} />
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          align="end"
          sideOffset={4}
          onClick={(e) => e.stopPropagation()}
          className="z-50 min-w-48 rounded-xl border border-border bg-surface p-1 shadow-lg motion-safe:animate-fade-in"
        >
          {items
            .filter((item) => !item.hidden)
            .map((item) => (
              <Dropdown.Item
                key={item.label}
                disabled={item.disabled}
                onSelect={item.onSelect}
                className={cn(
                  'flex min-h-control-sm cursor-pointer items-center gap-2 rounded-md px-2.5 text-sm outline-none [&_svg]:shrink-0 select-none data-[disabled]:cursor-default data-[disabled]:opacity-45 data-[highlighted]:bg-surface-2',
                  item.danger && 'text-danger',
                )}
              >
                {item.icon}
                {item.label}
              </Dropdown.Item>
            ))}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  )
}
