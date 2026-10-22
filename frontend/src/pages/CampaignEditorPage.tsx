import { useLocation, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { useCampaign } from '@/features/campaigns/api'
import { CampaignForm } from '@/features/campaigns/components/CampaignForm'
import { fromCampaign, type FormValues } from '@/features/campaigns/form'
import { useGroupLists } from '@/features/groups/api'
import { PageHeader } from '@/shared/ui/misc'

/** Новая заявка (/campaigns/new) или правка (/campaigns/:id/edit). */
export function CampaignEditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { data: campaign, isPending } = useCampaign(id)
  const lists = useGroupLists()
  // Со страницы «Группы»: отмеченные группы или список.
  const preset = location.state as Partial<FormValues> | null

  if (id && (isPending || lists.isPending)) return <p className="text-muted">Загрузка…</p>

  return (
    <>
      <PageHeader
        title={campaign ? `Заявка №${campaign.id}: изменение` : 'Новая заявка'}
        lead={campaign ? 'Новый текст уйдёт со следующей рассылки.' : 'Заполните поля — справа видно, как сообщение будет выглядеть в WhatsApp.'}
      />
      <CampaignForm
        key={campaign?.id ?? 'new'}
        campaign={campaign}
        initial={campaign ? fromCampaign(campaign, lists.data ?? []) : (preset ?? undefined)}
        onSaved={(saved) => {
          toast.success(campaign ? `Заявка №${saved.id} сохранена` : `Заявка №${saved.id} создана`)
          navigate(`/campaigns/${saved.id}`)
        }}
      />
    </>
  )
}
