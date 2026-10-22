import { useRef } from 'react'
import { useFormContext } from 'react-hook-form'
import type { FormValues } from '../form'
import { Textarea } from '@/shared/ui/input'

const EMOJI = ['📍', '📅', '✅', '🚛', '📦', '💰', '📞', '⛴️', '⚖️', '🔥', '⚠️', '❗️', '➡️', '🇰🇿', '🇨🇳', '🇷🇺', '🇺🇿', '🇦🇿', '🇬🇪', '🇹🇷', '1️⃣', '2️⃣', '3️⃣']
const MARKS = [
  { mark: '*', label: <b>Ж</b>, title: 'Жирный (Ctrl+B)' },
  { mark: '_', label: <i>К</i>, title: 'Курсив (Ctrl+I)' },
  { mark: '~', label: <s>З</s>, title: 'Зачёркнутый' },
]

/** Готовый текст: разметка WhatsApp кнопками, эмодзи, разделитель. */
export function TextEditor() {
  const { register, setValue, getValues, formState } = useFormContext<FormValues>()
  const ref = useRef<HTMLTextAreaElement | null>(null)
  const { ref: registerRef, ...field } = register('text')

  const replace = (build: (value: string, start: number, end: number) => { value: string; start: number; end: number }) => {
    const area = ref.current
    if (!area) return
    const next = build(getValues('text'), area.selectionStart, area.selectionEnd)
    setValue('text', next.value, { shouldDirty: true, shouldValidate: formState.isSubmitted })
    requestAnimationFrame(() => {
      area.focus()
      area.setSelectionRange(next.start, next.end)
    })
  }

  const insert = (text: string) => replace((v, s, e) => ({ value: v.slice(0, s) + text + v.slice(e), start: s + text.length, end: s + text.length }))

  // Пробелы по краям выделения остаются снаружи, иначе WhatsApp не распознает разметку; строки — по отдельности.
  const wrap = (mark: string) =>
    replace((v, s, e) => {
      const wrapped = v
        .slice(s, e)
        .split('\n')
        .map((line) => {
          const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(line)
          return m && m[2] ? `${m[1]}${mark}${m[2]}${mark}${m[3]}` : line
        })
        .join('\n')
      return s === e ? { value: v.slice(0, s) + mark + mark + v.slice(e), start: s + 1, end: s + 1 } : { value: v.slice(0, s) + wrapped + v.slice(e), start: s, end: s + wrapped.length }
    })

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface focus-within:border-accent">
      <div className="flex flex-wrap gap-0.5 border-b border-border bg-surface-2 p-1.5">
        {MARKS.map((m) => (
          <button key={m.mark} type="button" title={m.title} onClick={() => wrap(m.mark)} className="cursor-pointer rounded-md px-2.5 py-1 hover:bg-surface">
            {m.label}
          </button>
        ))}
        <button type="button" onClick={() => insert('\n━━━━━━━━━━━━━━━━━━━━\n\n')} className="cursor-pointer rounded-md px-2.5 py-1 text-sm hover:bg-surface">
          ━━ Разделитель
        </button>
        <span className="mx-1 w-px bg-border" />
        {EMOJI.map((e) => (
          <button key={e} type="button" onClick={() => insert(e)} className="cursor-pointer rounded-md px-1.5 py-1 text-lg leading-none hover:bg-surface">
            {e}
          </button>
        ))}
      </div>
      <Textarea
        {...field}
        ref={(el: HTMLTextAreaElement | null) => {
          registerRef(el)
          ref.current = el
        }}
        rows={16}
        aria-label="Текст сообщения"
        aria-invalid={!!formState.errors.text}
        placeholder="Вставьте готовое сообщение или наберите его здесь."
        className="min-h-80 rounded-none border-0 leading-relaxed focus-visible:outline-none"
        onKeyDown={(event) => {
          if (!(event.ctrlKey || event.metaKey)) return
          const key = event.key.toLowerCase()
          if (key === 'b' || key === 'и') {
            event.preventDefault()
            wrap('*')
          }
          if (key === 'i' || key === 'ш') {
            event.preventDefault()
            wrap('_')
          }
        }}
      />
      {formState.errors.text && <p className="px-3 pb-2 text-[13px] text-danger">{formState.errors.text.message}</p>}
    </div>
  )
}
