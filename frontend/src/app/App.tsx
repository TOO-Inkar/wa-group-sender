import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router'
import { Toaster } from 'sonner'
import { router } from './router'
import { ApiError } from '@/shared/api/client'
import { ConfirmProvider } from '@/shared/ui/confirm'

const MAX_RETRIES = 5

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
        {/* На телефоне — над нижней панелью разделов. */}
        <Toaster position="bottom-right" richColors closeButton mobileOffset={{ bottom: 'calc(72px + env(safe-area-inset-bottom))' }} />
      </ConfirmProvider>
    </QueryClientProvider>
  )
}
