import { PasswordCard } from '@/features/auth/PasswordCard'
import { AutoReplyCard } from '@/features/settings/AutoReplyCard'
import { DispatchCard } from '@/features/settings/DispatchCard'
import { StatsCards } from '@/features/settings/StatsCards'
import { TelegramCard } from '@/features/telegram/TelegramCard'
import { cn } from '@/shared/lib/cn'

const column = 'contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4'

export function SettingsPage() {
  return (
    <div className="grid min-w-0 gap-4">
      <h1 className="text-xl font-semibold">Настройки</h1>
      <StatsCards />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <div className={cn(column, 'max-lg:*:first:order-1 max-lg:*:last:order-3')}>
          <DispatchCard />
          <TelegramCard />
        </div>
        <div className={cn(column, 'max-lg:*:first:order-2 max-lg:*:last:order-4')}>
          <AutoReplyCard />
          <PasswordCard />
        </div>
      </div>
    </div>
  )
}
