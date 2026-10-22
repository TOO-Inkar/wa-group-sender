import { Pause, Pencil, Play, Send, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useCampaignAction } from '../api'
import { whereText } from '../model'
import type { Campaign } from '@/shared/api/types'
import { Button } from '@/shared/ui/button'
import { useConfirm } from '@/shared/ui/confirm'

/** Изменить, отправить сейчас, выключить/включить, удалить — с подтверждением и понятным итогом. */
export function CampaignActions({ campaign: c }: { campaign: Campaign }) {
  const action = useCampaignAction()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const run = (name: 'run' | 'disable' | 'enable' | 'delete', done: string) =>
    action.mutate(
      { action: name, id: c.id },
      {
        onSuccess: () => {
          toast.success(done)
          if (name === 'delete') navigate('/campaigns')
        },
        onError: (e) => toast.error(e.message),
      },
    )

  return (
    <div className="flex flex-wrap gap-1.5">
      <Button size="sm" onClick={() => navigate(`/campaigns/${c.id}/edit`)}>
        <Pencil size={14} /> Изменить
      </Button>
      <Button
        size="sm"
        disabled={!!c.current || action.isPending}
        title={c.current ? 'Рассылка ещё идёт' : undefined}
        onClick={async () => {
          if (await confirm({ title: `Разослать заявку №${c.id} сейчас?`, body: <p>Новая рассылка: {whereText(c)}. Пойдёт вместе с другими заявками, с общими паузами и лимитами.</p>, confirm: 'Отправить' }))
            run('run', `Заявка №${c.id}: новая рассылка в очереди`)
        }}
      >
        <Send size={14} /> Отправить сейчас
      </Button>
      {c.enabled || c.current ? (
        <Button
          size="sm"
          disabled={action.isPending}
          onClick={async () => {
            if (
              await confirm({
                title: `Выключить заявку №${c.id}?`,
                body: <p>{c.current && 'Идущая рассылка остановится: в оставшиеся группы не уйдёт. '}{c.repeatMode !== 'ONCE' && 'Повторы по расписанию прекратятся, пока не включите снова.'}</p>,
                confirm: 'Выключить',
              })
            )
              run('disable', `Заявка №${c.id} выключена`)
          }}
        >
          <Pause size={14} /> Выключить
        </Button>
      ) : (
        c.repeatMode !== 'ONCE' && (
          <Button size="sm" disabled={action.isPending} onClick={() => run('enable', `Расписание заявки №${c.id} включено`)}>
            <Play size={14} /> Включить расписание
          </Button>
        )
      )}
      <Button
        size="sm"
        variant="danger"
        disabled={action.isPending}
        onClick={async () => {
          if (
            await confirm({
              title: `Удалить заявку №${c.id}?`,
              body: <p>«{c.title}» пропадёт из списка{c.current ? ', её рассылка остановится' : ''}. История отправок останется в отчётах.</p>,
              confirm: 'Удалить',
              danger: true,
            })
          )
            run('delete', `Заявка №${c.id} удалена`)
        }}
      >
        <Trash2 size={14} /> Удалить
      </Button>
    </div>
  )
}
