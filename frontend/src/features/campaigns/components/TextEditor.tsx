import * as Popover from '@radix-ui/react-popover'
import { useRef, useState, type ReactNode } from 'react'
import { useFormContext, useWatch } from 'react-hook-form'
import { EMOJI, SEPARATOR, SKELETON } from '../emoji'
import type { FormValues } from '../form'
import { plural } from '@/shared/lib/format'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogActions } from '@/shared/ui/dialog'
import { Input, Textarea } from '@/shared/ui/input'

type Edit = (value: string, start: number, end: number) => { value: string; start: number; end: number }

function Tool({ title, onClick, children, active }: { title?: string; onClick?: () => void; children: ReactNode; active?: boolean }) {
  return (
    <button type="button" title={title} onClick={onClick} className={cn('cursor-pointer rounded-md px-2.5 py-1 text-sm hover:bg-surface hover:shadow-sm', active && 'bg-surface shadow-sm')}>
      {children}
    </button>
  )
}

function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState(Object.keys(EMOJI)[0]!)
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button type="button" title="Эмодзи и флаги" className={cn('cursor-pointer rounded-md px-2.5 py-1 text-sm hover:bg-surface hover:shadow-sm', open && 'bg-surface shadow-sm')}>
          😊 Эмодзи
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={6} onFocusOutside={(e) => e.preventDefault()} className="z-[60] grid w-[min(420px,calc(100vw-24px))] gap-1.5 rounded-xl border border-border bg-surface p-2 shadow-xl">
          <div className="flex flex-wrap gap-1">
            {Object.keys(EMOJI).map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setTab(name)}
                className={cn('cursor-pointer rounded-full px-2.5 py-0.5 text-[13px]', name === tab ? 'bg-accent-soft font-semibold text-ok-text' : 'text-muted hover:text-text')}
              >
                {name}
              </button>
            ))}
          </div>
          <div className="grid max-h-56 grid-cols-[repeat(auto-fill,minmax(36px,1fr))] gap-0.5 overflow-auto">
            {EMOJI[tab]!.map((emoji) => (
              <button key={emoji} type="button" title={emoji} onClick={() => onPick(emoji)} className="cursor-pointer rounded-lg py-1.5 text-[22px] leading-none hover:bg-surface-2">
                {emoji}
              </button>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

const CONTACT_FORM = 'contact-form'

function ContactDialog({ open, onOpenChange, onInsert }: { open: boolean; onOpenChange: (open: boolean) => void; onInsert: (contact: string) => void }) {
  const [value, setValue] = useState('')
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Контакт"
      footer={
        <DialogActions>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button type="submit" form={CONTACT_FORM} variant="primary" disabled={!value.trim()}>
            Вставить
          </Button>
        </DialogActions>
      }
    >
      <form
        id={CONTACT_FORM}
        className="grid gap-3"
        onKeyDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          // Rendered in a portal but still inside the campaign form in the React tree: keep its submit local.
          e.preventDefault()
          e.stopPropagation()
          if (!value.trim()) return
          onInsert(value.trim())
          onOpenChange(false)
        }}
      >
        <Input autoFocus placeholder="Имя +7 7xx xxx xx xx" value={value} onChange={(e) => setValue(e.target.value)} />
      </form>
    </Dialog>
  )
}

export function TextEditor() {
  const { register, setValue, getValues, control, formState } = useFormContext<FormValues>()
  const text = useWatch({ control, name: 'text' })
  const ref = useRef<HTMLTextAreaElement | null>(null)
  const [contactOpen, setContactOpen] = useState(false)
  const { ref: registerRef, ...field } = register('text')

  const apply = (edit: Edit) => {
    const area = ref.current
    if (!area) return
    const next = edit(getValues('text'), area.selectionStart, area.selectionEnd)
    setValue('text', next.value, { shouldDirty: true, shouldValidate: formState.isSubmitted })
    requestAnimationFrame(() => {
      area.focus()
      area.setSelectionRange(next.start, next.end)
    })
  }

  const insert = (snippet: string) => apply((v, s, e) => ({ value: v.slice(0, s) + snippet + v.slice(e), start: s + snippet.length, end: s + snippet.length }))

  const insertBlock = (snippet: string) =>
    apply((v, s, e) => {
      const lead = s > 0 && v[s - 1] !== '\n' ? '\n' : ''
      const piece = lead + snippet
      return { value: v.slice(0, s) + piece + v.slice(e), start: s + piece.length, end: s + piece.length }
    })

  // Spaces at the selection edges must stay outside the marks, otherwise WhatsApp ignores the markup.
  const wrap = (mark: string) =>
    apply((v, s, e) => {
      if (s === e) return { value: v.slice(0, s) + mark + mark + v.slice(e), start: s + mark.length, end: s + mark.length }
      const wrapOne = (part: string) => {
        const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(part)
        if (!m?.[2]) return part
        const inner = m[2]
        const already = inner.startsWith(mark) && inner.endsWith(mark) && inner.length > mark.length * 2
        return m[1] + (already ? inner.slice(mark.length, -mark.length) : mark + inner + mark) + m[3]
      }
      const selected = v.slice(s, e)
      const wrapped = mark === '```' ? wrapOne(selected) : selected.split('\n').map(wrapOne).join('\n')
      return { value: v.slice(0, s) + wrapped + v.slice(e), start: s, end: s + wrapped.length }
    })

  const chars = [...(text ?? '')].length
  const lines = text ? text.split('\n').length : 0

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface focus-within:border-accent">
      <div role="toolbar" aria-label="Форматирование" className="flex flex-wrap items-center gap-0.5 border-b border-border bg-surface-2 p-1.5">
        <Tool title="Жирный (Ctrl+B)" onClick={() => wrap('*')}>
          <b>Ж</b>
        </Tool>
        <Tool title="Курсив (Ctrl+I)" onClick={() => wrap('_')}>
          <i>К</i>
        </Tool>
        <Tool title="Зачёркнутый" onClick={() => wrap('~')}>
          <s>З</s>
        </Tool>
        <Tool title="Моноширинный" onClick={() => wrap('```')}>
          <code className="font-mono">M</code>
        </Tool>
        <span className="mx-1 h-5 w-px bg-border" />
        <EmojiPicker onPick={insert} />
        <Tool title="Линия-разделитель между заявками" onClick={() => insertBlock(SEPARATOR)}>
          ━━ Разделитель
        </Tool>
        <Tool title="Строка с контактом" onClick={() => setContactOpen(true)}>
          📞 Контакт
        </Tool>
        <Tool title="Заготовка одной заявки" onClick={() => insertBlock(SKELETON)}>
          📋 Шаблон
        </Tool>
      </div>
      <Textarea
        {...field}
        ref={(el: HTMLTextAreaElement | null) => {
          registerRef(el)
          ref.current = el
        }}
        rows={14}
        aria-label="Текст сообщения"
        aria-invalid={!!formState.errors.text}
        placeholder="Вставьте готовое сообщение или наберите его здесь. Выделите текст и нажмите Ж, чтобы сделать его жирным."
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
      <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 border-t border-border px-3 py-1.5 text-[13px] text-muted">
        <span className="tabular-nums">
          {plural(chars, 'символ', 'символа', 'символов')} · {plural(lines, 'строка', 'строки', 'строк')}
        </span>
        <span>*жирный* · _курсив_ · ~зачёркнутый~ · ```моно```</span>
      </div>
      {formState.errors.text && <p className="px-3 pb-2 text-[13px] text-danger">{formState.errors.text.message}</p>}
      <ContactDialog open={contactOpen} onOpenChange={setContactOpen} onInsert={(contact) => insertBlock(`\n📞 *${contact}*`)} />
    </div>
  )
}
