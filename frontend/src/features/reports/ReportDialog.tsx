import { useState } from 'react'
import { toast } from 'sonner'
import { download } from '@/shared/lib/download'
import { isoDay } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Dialog } from '@/shared/ui/dialog'
import { Segmented } from '@/shared/ui/segmented'
import { Field, Input } from '@/shared/ui/input'

const daysAgo = (days: number) => isoDay(new Date(Date.now() - days * 86_400_000))

const PRESETS = [
  { value: '0', label: 'Сегодня' },
  { value: '6', label: '7 дней' },
  { value: '29', label: '30 дней' },
]

export function ReportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [preset, setPreset] = useState('6')
  const [to, setTo] = useState(daysAgo(0))
  const [from, setFrom] = useState(daysAgo(6))
  const [busy, setBusy] = useState(false)

  const choose = (days: string) => {
    setPreset(days)
    setTo(daysAgo(0))
    setFrom(daysAgo(Number(days)))
  }

  const get = async (format: 'xlsx' | 'pdf') => {
    if (to < from) return toast.error('Дата «по» раньше даты «с»')
    setBusy(true)
    try {
      await download(`/api/admin/reports/period?from=${from}&to=${to}&format=${format}`, `wa-report-${from}_${to}.${format}`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Отчёт для заказчика" description="Рассылки за период: сколько отправлено, куда, ошибки понятными словами.">
      <Segmented stretch value={preset} options={PRESETS} onChange={choose} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="С" className="min-w-0">
          <Input type="date" className="min-w-0" value={from} onChange={(e) => (setFrom(e.target.value), setPreset(''))} />
        </Field>
        <Field label="По" className="min-w-0">
          <Input type="date" className="min-w-0" value={to} onChange={(e) => (setTo(e.target.value), setPreset(''))} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2 pt-1 sm:flex sm:justify-end">
        <Button className="min-h-10 justify-center" disabled={busy} onClick={() => get('xlsx')}>
          Excel
        </Button>
        <Button className="min-h-10 justify-center" variant="primary" disabled={busy} onClick={() => get('pdf')}>
          PDF
        </Button>
      </div>
    </Dialog>
  )
}
