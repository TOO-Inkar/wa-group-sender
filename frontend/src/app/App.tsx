import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { CSSProperties } from 'react'
import { RouterProvider } from 'react-router'
import { Toaster } from 'sonner'
import { router } from './router'
import { ApiError } from '@/shared/api/client'
import { ConfirmProvider } from '@/shared/ui/confirm'

const MAX_RETRIES = 5

const tint = (text: string, bg: string) => `color-mix(in srgb, var(${text}) 22%, var(${bg}))`

const TOAST_COLORS = {
  '--normal-bg': 'var(--raised)',
  '--normal-bg-hover': 'var(--surface-2)',
  '--normal-border': 'var(--border)',
  '--normal-border-hover': 'var(--border)',
  '--normal-text': 'var(--text)',
  '--success-bg': 'var(--ok-bg)',
  '--success-border': tint('--ok-text', '--ok-bg'),
  '--success-text': 'var(--ok-text)',
  '--info-bg': 'var(--info-bg)',
  '--info-border': tint('--info-text', '--info-bg'),
  '--info-text': 'var(--info-text)',
  '--warning-bg': 'var(--warn-bg)',
  '--warning-border': tint('--warn-text', '--warn-bg'),
  '--warning-text': 'var(--warn-text)',
  '--error-bg': 'var(--bad-bg)',
  '--error-border': tint('--bad-text', '--bad-bg'),
  '--error-text': 'var(--bad-text)',
  '--border-radius': '10px',
} as CSSProperties

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < MAX_RETRIES,
      refetchOnWindowFocus: true,
    },
  },
})

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfirmProvider>
        <RouterProvider router={router} />
        <Toaster theme="system" position="bottom-right" richColors closeButton style={TOAST_COLORS} mobileOffset={{ bottom: 'calc(72px + env(safe-area-inset-bottom))' }} />
      </ConfirmProvider>
    </QueryClientProvider>
  )
}
