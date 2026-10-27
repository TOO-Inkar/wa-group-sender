import { Building2, History, LayoutDashboard } from 'lucide-react'
import { type NavItem, Shell } from './Shell'
import { useMe } from '@/features/auth/api'
import { PLATFORM_PATH, TENANT_HOME } from '@/features/auth/model'

const ITEMS: NavItem[] = [
  { to: PLATFORM_PATH, label: 'Кабинеты', icon: Building2, end: false },
  { to: `${PLATFORM_PATH}/audit`, label: 'Журнал', icon: History },
  { to: TENANT_HOME, label: 'В кабинет', icon: LayoutDashboard },
]

export function PlatformLayout() {
  const { data: me } = useMe()
  return (
    <Shell
      items={ITEMS}
      title="Админка"
      status={<span className="block truncate text-[13px] leading-snug text-muted">{me?.username ?? 'суперадмин'}</span>}
    />
  )
}
