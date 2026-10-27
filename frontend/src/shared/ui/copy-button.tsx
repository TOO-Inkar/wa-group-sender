import { Check, Copy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from './button'
import { copyText } from '@/shared/lib/clipboard'

const COPIED_MS = 1500

export function CopyButton({ value, label = 'Скопировать', text, className }: { value: string; label?: string; text?: string; className?: string }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), COPIED_MS)
    return () => clearTimeout(timer)
  }, [copied])

  const copy = async () => {
    if (await copyText(value)) {
      setCopied(true)
      toast.success('Скопировано')
    } else toast.error('Не удалось скопировать — выделите текст и скопируйте вручную')
  }

  const icon = copied ? <Check size={16} className="text-accent" /> : <Copy size={16} />
  return text ? (
    <Button size="sm" onClick={copy} className={className}>
      {icon} {text}
    </Button>
  ) : (
    <Button variant="ghost" size="icon" onClick={copy} aria-label={label} title={label} className={className}>
      {icon}
    </Button>
  )
}
