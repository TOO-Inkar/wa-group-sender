import { RefreshCw } from 'lucide-react'
import { generatePassword } from '../model'
import { Button } from '@/shared/ui/button'
import { CopyButton } from '@/shared/ui/copy-button'
import { Field, Input } from '@/shared/ui/input'

export function PasswordField({ value, onChange, error, label = 'Пароль' }: { value: string; onChange: (value: string) => void; error?: string; label?: string }) {
  return (
    <Field label={label} error={error} hint="Не короче 8 символов">
      <span className="flex gap-1.5">
        <Input autoComplete="new-password" spellCheck={false} className="min-w-0 font-mono" value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} />
        <Button onClick={() => onChange(generatePassword())} title="Сгенерировать пароль" className="shrink-0">
          <RefreshCw size={15} /> <span className="hidden sm:inline">Сгенерировать</span>
        </Button>
        <CopyButton value={value} label="Скопировать пароль" />
      </span>
    </Field>
  )
}
