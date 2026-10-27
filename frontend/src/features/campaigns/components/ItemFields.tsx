import { X } from 'lucide-react'
import { useFieldArray, useFormContext } from 'react-hook-form'
import { emptyItem, ITEM_LABELS, type FormValues, type ItemField } from '../form'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/button'
import { Caption, Input, Textarea } from '@/shared/ui/input'

const LAYOUT: { name: ItemField; span?: boolean }[] = [{ name: 'route' }, { name: 'date' }, { name: 'vehicles', span: true }, { name: 'cargo' }, { name: 'conditions' }, { name: 'freight' }]

function Label({ name, error }: { name: ItemField; error?: string }) {
  const meta = ITEM_LABELS[name]
  return (
    <Caption className="flex items-baseline justify-between gap-2">
      <span>
        {meta.title}
        {meta.required && <span className="text-danger"> *</span>}
      </span>
      {error && <span className="font-normal text-danger">{error}</span>}
    </Caption>
  )
}

export function ItemFields() {
  const { control, register, formState } = useFormContext<FormValues>()
  const { fields, append, remove } = useFieldArray({ control, name: 'items' })

  return (
    <div className="grid gap-3">
      {fields.map((item, index) => (
        <div key={item.id} className={cn('grid gap-2.5', fields.length > 1 && 'rounded-xl border border-border p-3')}>
          {fields.length > 1 && (
            <div className="flex items-center justify-between text-[13px] font-semibold">
              Заявка {index + 1}
              <Button variant="ghost" size="icon" onClick={() => remove(index)} aria-label={`Убрать заявку ${index + 1}`}>
                <X size={15} />
              </Button>
            </div>
          )}
          <div className="grid gap-2.5 sm:grid-cols-2">
            {LAYOUT.map(({ name, span }) => {
              const meta = ITEM_LABELS[name]
              const error = formState.errors.items?.[index]?.[name]?.message
              const props = { ...register(`items.${index}.${name}`), placeholder: meta.placeholder, 'data-nav': '', 'aria-invalid': !!error }
              return (
                <label key={name} className={cn('grid gap-1', span && 'sm:col-span-2')}>
                  <Label name={name} error={error} />
                  {meta.rows ? <Textarea rows={name === 'vehicles' ? 2 : 1} {...props} /> : <Input autoComplete="off" {...props} />}
                </label>
              )
            })}
          </div>
        </div>
      ))}
      <Button variant="link" size="inline" className="justify-self-start" onClick={() => append(emptyItem(), { shouldFocus: true })}>
        + ещё заявка в это же сообщение
      </Button>
    </div>
  )
}
