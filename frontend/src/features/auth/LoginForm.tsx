import { useState, type FormEvent } from 'react'
import { useLogin } from './api'
import { Button } from '@/shared/ui/button'
import { Field, Input } from '@/shared/ui/input'

export function LoginForm() {
  const login = useLogin()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [shown, setShown] = useState(false)
  const [error, setError] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!username.trim() || !password) {
      setError('Введите логин и пароль')
      return
    }
    setError('')
    login.mutate(
      { username: username.trim(), password },
      { onError: (e) => setError(e.message === 'Нужно войти заново' ? 'Неверный логин или пароль' : e.message) },
    )
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-3.5">
      <Field label="Логин">
        <Input autoComplete="username" autoCapitalize="off" spellCheck={false} autoFocus value={username} onChange={(e) => setUsername(e.target.value)} />
      </Field>
      <Field label="Пароль">
        <span className="relative block">
          <Input
            type={shown ? 'text' : 'password'}
            autoComplete="current-password"
            className="pr-24"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button variant="ghost" size="sm" className="absolute top-1/2 right-1 -translate-y-1/2" onClick={() => setShown(!shown)}>
            {shown ? 'скрыть' : 'показать'}
          </Button>
        </span>
      </Field>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" size="lg" disabled={login.isPending}>
        {login.isPending ? 'Входим…' : 'Войти'}
      </Button>
    </form>
  )
}
