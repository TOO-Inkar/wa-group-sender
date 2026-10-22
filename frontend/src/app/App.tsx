import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router'
import { Toaster } from 'sonner'
import { router } from './router'
import { ApiError } from '@/shared/api/client'
import { ConfirmProvider } from '@/shared/ui/confirm'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 4xx не повторяем: это не сбой сети, а ответ сервера.
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
        <Toaster position="top-center" richColors closeButton />
      </ConfirmProvider>
    </QueryClientProvider>
  )
}
