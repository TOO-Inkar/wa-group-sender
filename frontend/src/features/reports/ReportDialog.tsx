import { useState } from 'react'
import { toast } from 'sonner'
import { download } from '@/shared/lib/download'
import { isoDay } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogActions } from '@/shared/ui/dialog'
import { Chips } from '@/shared/ui/misc'
import { Field, Input } from '@/shared/ui/input'

const PRESETS = [
  { value: '0', label: 'Сегодня' },
  { value: '6', label: '7 дней' },
  { value: '29', label: '30 дней' },
]

/** Отчёт для заказчика за период: Excel или PDF. */
export function ReportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [preset, setPreset] = useState('6')
  const [to, setTo] = useState(isoDay(new Date()))
  const [from, setFrom] = useState(isoDay(new Date(Date.now() - 6 * 86_400_000)))
  const [busy, setBusy] = useState(false)

  const choose = (days: string) => {
    setPreset(days)
    setTo(isoDay(new Date()))
    setFrom(isoDay(new Date(Date.now() - Number(days) * 86_400_000)))
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
      <Chips value={preset} options={PRESETS} onChange={choose} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="С">
          <Input type="date" value={from} onChange={(e) => (setFrom(e.target.value), setPreset(''))} />
        </Field>
        <Field label="По">
          <Input type="date" value={to} onChange={(e) => (setTo(e.target.value), setPreset(''))} />
        </Field>
      </div>
      <DialogActions>
        <Button disabled={busy} onClick={() => get('xlsx')}>
          Excel
        </Button>
        <Button variant="primary" disabled={busy} onClick={() => get('pdf')}>
          PDF
        </Button>
      </DialogActions>
    </Dialog>
  )
}
