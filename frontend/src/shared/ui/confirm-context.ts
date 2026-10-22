import { createContext, use, type ReactNode } from 'react'

export type ConfirmOptions = { title: string; body?: ReactNode; confirm?: string; danger?: boolean }
export type Confirm = (options: ConfirmOptions) => Promise<boolean>

export const ConfirmContext = createContext<Confirm | null>(null)

export function useConfirm(): Confirm {
  const confirm = use(ConfirmContext)
  if (!confirm) throw new Error('useConfirm вне ConfirmProvider')
  return confirm
}
