import { useState, type ReactNode } from 'react'
import { Button } from './button'

export const PAGE_SIZE = 100

export function Paged<T>({ items, children }: { items: T[]; children: (visible: T[]) => ReactNode }) {
  const [limit, setLimit] = useState(PAGE_SIZE)
  const rest = items.length - limit

  return (
    <>
      {children(items.slice(0, limit))}
      {rest > 0 && (
        <Button variant="ghost" className="w-full" onClick={() => setLimit(limit + PAGE_SIZE)}>
          Показать ещё {Math.min(rest, PAGE_SIZE)} из {rest}
        </Button>
      )}
    </>
  )
}
