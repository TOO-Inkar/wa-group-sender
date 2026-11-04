import { ClipboardList, Settings, ShieldCheck, Smartphone, Users } from 'lucide-react'
import { Link } from 'react-router'
import { type NavItem, Shell, SIDE_ITEM } from './Shell'
import { useMe } from '@/features/auth/api'
import { isSuperadmin, PLATFORM_PATH } from '@/features/auth/model'
import { useHealth } from '@/features/health/api'
import { StatusBanner } from '@/features/health/StatusBanner'
import { StatusChip } from '@/features/health/StatusChip'
import { sessionTone } from '@/features/health/texts'
import { CabinetSwitcher } from '@/features/platform/components/CabinetSwitcher'
import { useTelegram } from '@/features/telegram/api'
import { Count, Dot } from '@/shared/ui/badge'

export function AppLayout() {
  const { data: me } = useMe()
  const { data: health } = useHealth()
  const { data: telegram } = useTelegram()
  const tone = health ? sessionTone(health.session) : 'bad'
  const pending = telegram?.subscribers.filter((s) => s.status === 'PENDING').length ?? 0

  const items: NavItem[] = [
    { to: '/campaigns', label: 'Заявки', icon: ClipboardList, extra: <Count value={health?.queueLength ?? 0} /> },
    { to: '/groups', label: 'Группы', icon: Users },
    { to: '/connection', label: 'Подключение', icon: Smartphone, extra: <Dot tone={tone} /> },
    { to: '/settings', label: 'Настройки', icon: Settings, extra: <Count value={pending} /> },
  ]

  return (
    <Shell
      items={items}
      title={<CabinetSwitcher />}
      status={<StatusChip />}
      banner={<StatusBanner />}
      footer={
        isSuperadmin(me) && (
          <Link to={PLATFORM_PATH} className={SIDE_ITEM}>
            <ShieldCheck size={16} /> Админка
          </Link>
        )
      }
    />
  )
}
