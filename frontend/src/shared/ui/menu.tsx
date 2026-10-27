import * as Dropdown from '@radix-ui/react-dropdown-menu'
import { MoreHorizontal } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

type MenuItem = { label: string; icon?: ReactNode; onSelect: () => void; disabled?: boolean; danger?: boolean; hidden?: boolean }

export function RowMenu({ items, label = 'Действия', bordered }: { items: MenuItem[]; label?: string; bordered?: boolean }) {
  return (
    <Dropdown.Root modal={false}>
      <Dropdown.Trigger
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'grid shrink-0 cursor-pointer place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-text focus-visible:shadow-[0_0_0_3px_var(--accent-soft)] focus-visible:outline-none data-[state=open]:bg-surface-2',
          bordered ? 'size-10 border border-border bg-surface' : 'size-8',
        )}
      >
        <MoreHorizontal size={18} />
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          align="end"
          sideOffset={4}
          onClick={(e) => e.stopPropagation()}
          className="z-50 min-w-48 rounded-xl border border-border bg-surface p-1 shadow-xl"
        >
          {items
            .filter((item) => !item.hidden)
            .map((item) => (
              <Dropdown.Item
                key={item.label}
                disabled={item.disabled}
                onSelect={item.onSelect}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none select-none data-[disabled]:cursor-default data-[disabled]:opacity-45 data-[highlighted]:bg-surface-2',
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
