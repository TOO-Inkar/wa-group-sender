import { ConnectionPanel } from '@/features/connection/ConnectionPanel'

export function ConnectionPage() {
  return (
    <div className="grid gap-3">
      <h1 className="text-xl font-semibold">Номер WhatsApp</h1>
      <ConnectionPanel />
    </div>
  )
}
