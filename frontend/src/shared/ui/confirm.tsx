import { createContext, use, useCallback, useRef, useState, type ReactNode } from 'react'
import { Button } from './button'
import { Dialog, DialogActions } from './dialog'

type Options = { title: string; body?: ReactNode; confirm?: string; danger?: boolean }
type Confirm = (options: Options) => Promise<boolean>

const ConfirmContext = createContext<Confirm | null>(null)

/** Подтверждение действия в своём окне вместо window.confirm: await confirm({ title }) → true/false. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<Options | null>(null)
  const resolver = useRef<(value: boolean) => void>(null)

  const confirm = useCallback<Confirm>((next) => {
    setOptions(next)
    return new Promise((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const finish = (value: boolean) => {
    resolver.current?.(value)
    resolver.current = null
    setOptions(null)
  }

  return (
    <ConfirmContext value={confirm}>
      {children}
      <Dialog open={options !== null} onOpenChange={(open) => !open && finish(false)} title={options?.title ?? ''} wide>
        {options?.body && <div className="grid gap-2 text-sm text-muted">{options.body}</div>}
        <DialogActions>
          <Button variant="ghost" onClick={() => finish(false)}>
            Отмена
          </Button>
          <Button variant={options?.danger ? 'danger' : 'primary'} onClick={() => finish(true)} autoFocus>
            {options?.confirm ?? 'ОК'}
          </Button>
        </DialogActions>
      </Dialog>
    </ConfirmContext>
  )
}

// Хук рядом с провайдером — одна точка входа; быстрому обновлению в dev это не мешает.
// eslint-disable-next-line react-refresh/only-export-components
export function useConfirm(): Confirm {
  const confirm = use(ConfirmContext)
  if (!confirm) throw new Error('useConfirm вне ConfirmProvider')
  return confirm
}
