import { AutoReplyCard } from '@/features/settings/AutoReplyCard'
import { DispatchCard } from '@/features/settings/DispatchCard'
import { StatsCards } from '@/features/settings/StatsCards'
import { TelegramCard } from '@/features/telegram/TelegramCard'
import { PageHeader } from '@/shared/ui/misc'

export function SettingsPage() {
  return (
    <>
      <PageHeader title="Настройки" lead="Состояние рассылки, рабочее окно и лимиты, автоответчик, уведомления." />
      <div className="grid gap-4">
        <StatsCards />
        <div className="grid items-start gap-3 md:grid-cols-[repeat(auto-fit,minmax(300px,1fr))]">
          <DispatchCard />
          <AutoReplyCard />
          <TelegramCard />
        </div>
      </div>
    </>
  )
}
