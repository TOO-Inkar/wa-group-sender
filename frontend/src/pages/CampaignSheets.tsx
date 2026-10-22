import { useLocation, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { useCampaign } from '@/features/campaigns/api'
import { CampaignFormSheet } from '@/features/campaigns/components/CampaignForm'
import { CampaignSheet } from '@/features/campaigns/components/CampaignSheet'
import { fromCampaign, type FormValues } from '@/features/campaigns/form'
import { useGroupLists } from '@/features/groups/api'

export function CampaignRoute() {
  const { id } = useParams()
  const navigate = useNavigate()
  return <CampaignSheet key={id} id={id!} onClose={() => navigate('/campaigns')} />
}

export function NewCampaignRoute() {
  const navigate = useNavigate()
  const preset = useLocation().state as Partial<FormValues> | null
  return (
    <CampaignFormSheet
      initial={preset ?? undefined}
      onClose={(saved) => {
        if (saved) toast.success(`Заявка №${saved.id} создана`)
        navigate(saved ? `/campaigns/${saved.id}` : '/campaigns')
      }}
    />
  )
}

export function EditCampaignRoute() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: campaign } = useCampaign(id)
  const lists = useGroupLists()
  if (!campaign || lists.isPending) return null
  return (
    <CampaignFormSheet
      key={campaign.id}
      campaign={campaign}
      initial={fromCampaign(campaign, lists.data ?? [])}
      onClose={(saved) => {
        if (saved) toast.success(`Заявка №${saved.id} сохранена`)
        navigate(`/campaigns/${id}`)
      }}
    />
  )
}
