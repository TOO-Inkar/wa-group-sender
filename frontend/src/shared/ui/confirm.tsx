import { useCallback, useRef, useState, type ReactNode } from 'react'
import { Button } from './button'
import { ConfirmContext, type Confirm, type ConfirmOptions } from './confirm-context'
import { Dialog, DialogActions } from './dialog'

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
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
      <Dialog
        open={options !== null}
        onOpenChange={(open) => !open && finish(false)}
        title={options?.title ?? ''}
        wide
        footer={
          <DialogActions>
            <Button variant="ghost" onClick={() => finish(false)}>
              Отмена
            </Button>
            <Button variant={options?.danger ? 'danger' : 'primary'} onClick={() => finish(true)} autoFocus>
              {options?.confirm ?? 'ОК'}
            </Button>
          </DialogActions>
        }
      >
        {options?.body && <div className="grid gap-2 text-sm text-muted">{options.body}</div>}
      </Dialog>
    </ConfirmContext>
  )
}
