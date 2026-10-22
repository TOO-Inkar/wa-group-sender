import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router'
import { Toaster } from 'sonner'
import { router } from './router'
import { ApiError } from '@/shared/api/client'
import { ConfirmProvider } from '@/shared/ui/confirm'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
      refetchOnWindowFocus: true,
    },
  },
})

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfirmProvider>
        <RouterProvider router={router} />
        <Toaster position="bottom-right" richColors closeButton />
      </ConfirmProvider>
    </QueryClientProvider>
  )
}
