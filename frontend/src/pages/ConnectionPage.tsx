import { ConnectionPanel } from '@/features/connection/ConnectionPanel'
import { PageHeader } from '@/shared/ui/misc'

export function ConnectionPage() {
  return (
    <>
      <PageHeader title="Подключение к WhatsApp" />
      <ConnectionPanel />
    </>
  )
}
