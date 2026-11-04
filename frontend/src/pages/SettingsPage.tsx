import { PasswordCard } from '@/features/auth/PasswordCard'
import { AutoReplyCard } from '@/features/settings/AutoReplyCard'
import { DispatchCard } from '@/features/settings/DispatchCard'
import { StatsCards } from '@/features/settings/StatsCards'
import { TelegramCard } from '@/features/telegram/TelegramCard'

export function SettingsPage() {
  return (
    <div className="grid min-w-0 gap-4">
      <h1 className="text-xl font-semibold">Настройки</h1>
      <StatsCards />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <DispatchCard />
        <AutoReplyCard />
        <TelegramCard />
        <PasswordCard />
      </div>
    </div>
  )
}
