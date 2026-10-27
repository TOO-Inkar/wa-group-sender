import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { useChangePassword, useMe } from './api'
import { MIN_PASSWORD, passwordChangeErrors, type PasswordChange } from './model'
import { Button } from '@/shared/ui/button'
import { Card, CardTitle } from '@/shared/ui/card'
import { Field, Input } from '@/shared/ui/input'

const EMPTY: PasswordChange = { current: '', next: '', repeat: '' }

export function PasswordCard() {
  const { data: me } = useMe()
  const change = useChangePassword()
  const [values, setValues] = useState(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<keyof PasswordChange, string>>>({})
  const [failure, setFailure] = useState('')
  const field = (key: keyof PasswordChange) => ({
    value: values[key],
    onChange: (e: { target: { value: string } }) => setValues((v) => ({ ...v, [key]: e.target.value })),
    'aria-invalid': !!errors[key],
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const found = passwordChangeErrors(values)
    setErrors(found)
    setFailure('')
    if (Object.keys(found).length) return
    change.mutate(
      { current: values.current, next: values.next },
      {
        onSuccess: () => {
          setValues(EMPTY)
          toast.success('Пароль изменён')
        },
        onError: (e) => setFailure(e.message),
      },
    )
  }

  return (
    <Card className="grid content-start gap-3">
      <CardTitle className="mb-0">Сменить пароль</CardTitle>
      {me?.username && (
        <p className="text-[13px] text-muted">
          Логин: <b className="text-text">{me.username}</b>. Другие устройства выйдут из аккаунта.
        </p>
      )}
      <form onSubmit={submit} noValidate className="grid gap-3">
        <input type="text" autoComplete="username" value={me?.username ?? ''} readOnly hidden />
        <Field label="Текущий пароль" error={errors.current}>
          <Input type="password" autoComplete="current-password" {...field('current')} />
        </Field>
        <Field label="Новый пароль" error={errors.next} hint={`Не короче ${MIN_PASSWORD} символов`}>
          <Input type="password" autoComplete="new-password" {...field('next')} />
        </Field>
        <Field label="Повторите новый пароль" error={errors.repeat}>
          <Input type="password" autoComplete="new-password" {...field('repeat')} />
        </Field>
        {failure && (
          <p role="alert" className="text-sm text-danger">
            {failure}
          </p>
        )}
        <Button type="submit" className="justify-self-start" disabled={change.isPending}>
          {change.isPending ? 'Сохраняем…' : 'Сменить пароль'}
        </Button>
      </form>
    </Card>
  )
}
