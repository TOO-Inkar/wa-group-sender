import type { ReactNode } from 'react'
import { useFormContext } from 'react-hook-form'
import type { FormValues } from '../form'

/** Вариант выбора карточкой: радиокнопка, заголовок, пояснение и поля внутри. */
export function Option({ name, value, title, children }: { name: 'target' | 'repeat'; value: string; title: string; children?: ReactNode }) {
  const { register } = useFormContext<FormValues>()
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border px-3 py-2.5 has-[input[type=radio]:checked]:border-accent has-[input[type=radio]:checked]:bg-accent-soft">
      <input type="radio" value={value} className="mt-1 size-4 accent-accent" {...register(name)} />
      <span className="grid min-w-0 flex-1 justify-items-start gap-1.5">
        <b className="text-sm">{title}</b>
        {children && <span className="flex flex-wrap items-center gap-2 text-[13px] text-muted">{children}</span>}
      </span>
    </label>
  )
}

export function OptionGroup({ legend, error, children }: { legend: string; error?: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1.5 text-sm font-semibold">{legend}</legend>
      {children}
      {error && <p className="text-[13px] text-danger">{error}</p>}
    </fieldset>
  )
}
