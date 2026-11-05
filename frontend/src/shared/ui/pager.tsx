import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { cn } from '@/shared/lib/cn'
import { isPageSize, PAGE_SIZES, pageRange, type Paging } from '@/shared/lib/paging'
import { Button } from './button'
import { Select } from './input'

export function Pager<T>({ paging, label, className }: { paging: Paging<T>; label: string; className?: string }) {
  const { page, pages, size, total, goTo, setSize } = paging
  if (total <= PAGE_SIZES[0]) return null
  const { from, to } = pageRange(page, total, size)
  const first = page === 1
  const last = page === pages

  return (
    <nav aria-label={label} className={cn('@container', className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <span className="text-caption text-muted tabular-nums">
          {from}–{to} из {total}
        </span>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <label className="flex items-center gap-2 text-caption text-muted">
            <span className="@max-lg:sr-only">На странице</span>
            <Select
              className="text-sm sm:min-w-0"
              value={size}
              onChange={(e) => {
                const next = Number(e.target.value)
                if (isPageSize(next)) setSize(next)
              }}
            >
              {PAGE_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </label>
          <div className="flex items-center gap-1">
            <Button size="icon" className="@max-lg:hidden" aria-label="Первая страница" disabled={first} onClick={() => goTo(1)}>
              <ChevronsLeft size={16} />
            </Button>
            <Button size="icon" aria-label="Предыдущая страница" disabled={first} onClick={() => goTo(page - 1)}>
              <ChevronLeft size={16} />
            </Button>
            <span aria-current="page" className="min-w-14 px-1 text-center text-sm tabular-nums">
              <span className="@max-lg:sr-only">
                Страница {page} из {pages}
              </span>
              <span aria-hidden className="@lg:hidden">
                {page} / {pages}
              </span>
            </span>
            <Button size="icon" aria-label="Следующая страница" disabled={last} onClick={() => goTo(page + 1)}>
              <ChevronRight size={16} />
            </Button>
            <Button size="icon" className="@max-lg:hidden" aria-label="Последняя страница" disabled={last} onClick={() => goTo(pages)}>
              <ChevronsRight size={16} />
            </Button>
          </div>
        </div>
      </div>
    </nav>
  )
}
