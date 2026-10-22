import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useCampaignAction } from './api'
import { whereText } from './model'
import type { Campaign } from '@/shared/api/types'
import { useConfirm } from '@/shared/ui/confirm-context'

export function useCampaignCommands() {
  const action = useCampaignAction()
  const confirm = useConfirm()
  const navigate = useNavigate()

  const run = (name: 'run' | 'disable' | 'enable' | 'delete', c: Campaign, done: string, after?: () => void) =>
    action.mutate(
      { action: name, id: c.id },
      {
        onSuccess: () => {
          toast.success(done)
          after?.()
        },
        onError: (e) => toast.error(e.message),
      },
    )

  return {
    busy: action.isPending,
    edit: (c: Campaign) => navigate(`/campaigns/${c.id}/edit`),
    sendNow: async (c: Campaign) => {
      if (await confirm({ title: `Разослать №${c.id} сейчас?`, body: <p>Новая рассылка: {whereText(c)}.</p>, confirm: 'Отправить' })) run('run', c, `№${c.id}: рассылка в очереди`)
    },
    disable: async (c: Campaign) => {
      if (
        await confirm({
          title: `Выключить №${c.id}?`,
          body: <p>{[c.current && 'Идущая рассылка остановится.', c.repeatMode !== 'ONCE' && 'Повторы прекратятся.'].filter(Boolean).join(' ')}</p>,
          confirm: 'Выключить',
        })
      )
        run('disable', c, `№${c.id} выключена`)
    },
    enable: (c: Campaign) => run('enable', c, `№${c.id}: расписание включено`),
    remove: async (c: Campaign) => {
      if (await confirm({ title: `Удалить №${c.id}?`, body: <p>«{c.title}» пропадёт из списка. История останется в отчётах.</p>, confirm: 'Удалить', danger: true }))
        run('delete', c, `№${c.id} удалена`, () => navigate('/campaigns'))
    },
  }
}
