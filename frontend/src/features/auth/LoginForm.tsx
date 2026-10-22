import { Eye, EyeOff } from 'lucide-react'
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
            className="pr-11"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShown(!shown)}
            aria-label={shown ? 'Скрыть пароль' : 'Показать пароль'}
            title={shown ? 'Скрыть пароль' : 'Показать пароль'}
            className="absolute top-1/2 right-1.5 grid size-8 -translate-y-1/2 cursor-pointer place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-text"
          >
            {shown ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
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
