import { toast } from 'sonner'
import { useEnterTenant, useUpdateTenant, type TenantOverview } from './api'
import { isBlocked } from './model'
import { useConfirm } from '@/shared/ui/confirm-context'

export function useTenantCommands() {
  const enter = useEnterTenant()
  const update = useUpdateTenant()
  const confirm = useConfirm()

  return {
    busy: enter.isPending || update.isPending,
    enter: (t: TenantOverview) => enter.mutate(t.id, { onError: (e) => toast.error(e.message) }),
    toggleBlock: async (t: TenantOverview) => {
      const blocking = !isBlocked(t)
      const ok = await confirm(
        blocking
          ? {
              title: `Заблокировать «${t.name}»?`,
              body: <p>Рассылка остановится, номер отключится, пользователи кабинета не смогут войти. Данные сохранятся.</p>,
              confirm: 'Заблокировать',
              danger: true,
            }
          : { title: `Разблокировать «${t.name}»?`, body: <p>Пользователи снова смогут войти, номер переподключится, рассылка продолжится.</p>, confirm: 'Разблокировать' },
      )
      if (!ok) return
      update.mutate(
        { id: t.id, status: blocking ? 'BLOCKED' : 'ACTIVE' },
        { onSuccess: () => toast.success(blocking ? 'Кабинет заблокирован' : 'Кабинет разблокирован'), onError: (e) => toast.error(e.message) },
      )
    },
  }
}
