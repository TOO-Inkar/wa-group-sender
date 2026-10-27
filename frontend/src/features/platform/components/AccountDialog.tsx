import { useState, type FormEvent } from 'react'
import { accountErrors, generatePassword, PROXY_PLACEHOLDER, type Account, type AccountField } from '../model'
import { Credentials, type Credential } from './Credentials'
import { PasswordField } from './PasswordField'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogActions } from '@/shared/ui/dialog'
import { Field, Input } from '@/shared/ui/input'

const FORM_ID = 'account-form'

export function AccountDialog({
  title,
  doneTitle,
  submitLabel,
  fields,
  fixedLogin,
  description,
  onSubmit,
  onClose,
}: {
  title: string
  doneTitle: string
  submitLabel: string
  fields: AccountField[]
  fixedLogin?: string
  description?: string
  onSubmit: (values: Account) => Promise<unknown>
  onClose: () => void
}) {
  const [values, setValues] = useState<Account>(() => ({ name: '', login: fixedLogin ?? '', password: generatePassword(), proxy: '' }))
  const [errors, setErrors] = useState<Partial<Record<AccountField, string>>>({})
  const [failure, setFailure] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<Credential[] | null>(null)
  const set = (field: AccountField) => (value: string) => setValues((v) => ({ ...v, [field]: value }))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const found = accountErrors(values, fields)
    setErrors(found)
    if (Object.keys(found).length) return
    const trimmed = { ...values, name: values.name.trim(), login: values.login.trim(), proxy: values.proxy.trim() }
    setBusy(true)
    setFailure('')
    try {
      await onSubmit(trimmed)
      setDone([
        ...(fields.includes('name') ? [{ label: 'Кабинет', value: trimmed.name }] : []),
        { label: 'Логин', value: trimmed.login },
        { label: 'Пароль', value: trimmed.password },
      ])
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={done ? doneTitle : title}
      description={done ? undefined : description}
      footer={
        <DialogActions>
          {done ? (
            <Button variant="primary" onClick={onClose}>
              Готово
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose}>
                Отмена
              </Button>
              <Button type="submit" form={FORM_ID} variant="primary" disabled={busy}>
                {busy ? 'Сохраняем…' : submitLabel}
              </Button>
            </>
          )}
        </DialogActions>
      }
    >
      {done ? (
        <Credentials rows={done} />
      ) : (
        <form id={FORM_ID} onSubmit={submit} noValidate className="grid gap-3.5">
          {fields.includes('name') && (
            <Field label="Название кабинета" required error={errors.name}>
              <Input autoFocus value={values.name} onChange={(e) => set('name')(e.target.value)} aria-invalid={!!errors.name} placeholder="ТОО «Логистик»" />
            </Field>
          )}
          {fields.includes('login') && (
            <Field label="Логин" required error={errors.login}>
              <Input autoFocus={!fields.includes('name')} autoComplete="off" autoCapitalize="off" spellCheck={false} value={values.login} onChange={(e) => set('login')(e.target.value)} aria-invalid={!!errors.login} />
            </Field>
          )}
          {fields.includes('password') && <PasswordField label={fixedLogin ? 'Новый пароль' : 'Пароль'} value={values.password} onChange={set('password')} error={errors.password} />}
          {fields.includes('proxy') && (
            <Field label="Прокси" error={errors.proxy} hint="Через него номер подключается к WhatsApp. Можно задать позже.">
              <Input autoComplete="off" autoCapitalize="off" spellCheck={false} className="font-mono" placeholder={PROXY_PLACEHOLDER} value={values.proxy} onChange={(e) => set('proxy')(e.target.value)} aria-invalid={!!errors.proxy} />
            </Field>
          )}
          {failure && (
            <p role="alert" className="text-sm text-danger">
              {failure}
            </p>
          )}
        </form>
      )}
    </Dialog>
  )
}
