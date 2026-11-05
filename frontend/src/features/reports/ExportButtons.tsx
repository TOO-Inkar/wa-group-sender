import type { ReactNode } from 'react'
import { Button } from '@/shared/ui/button'

export type ReportFormat = 'xlsx' | 'pdf'

export function ExportButtons({ onExport, disabled, children }: { onExport: (format: ReportFormat) => void; disabled?: boolean; children?: ReactNode }) {
  return (
    <div className="grid w-full grid-cols-2 gap-2 @min-[480px]:ml-auto @min-[480px]:flex @min-[480px]:w-auto @min-[480px]:flex-wrap @min-[480px]:justify-end">
      {children}
      <Button disabled={disabled} onClick={() => onExport('xlsx')}>
        Excel
      </Button>
      <Button disabled={disabled} onClick={() => onExport('pdf')}>
        PDF
      </Button>
    </div>
  )
}
