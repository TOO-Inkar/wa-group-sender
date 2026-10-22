import { AutoReplyCard } from '@/features/settings/AutoReplyCard'
import { DispatchCard } from '@/features/settings/DispatchCard'
import { StatsCards } from '@/features/settings/StatsCards'
import { TelegramCard } from '@/features/telegram/TelegramCard'

export function SettingsPage() {
  return (
    <div className="grid gap-3">
      <h1 className="text-xl font-semibold">Настройки</h1>
      <StatsCards />
      <div className="grid items-start gap-3 md:grid-cols-[repeat(auto-fit,minmax(300px,1fr))]">
        <DispatchCard />
        <AutoReplyCard />
        <TelegramCard />
      </div>
    </div>
  )
}
