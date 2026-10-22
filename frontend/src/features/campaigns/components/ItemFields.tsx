import { useFieldArray, useFormContext } from 'react-hook-form'
import { emptyItem, ITEM_FIELDS, ITEM_LABELS, type FormValues } from '../form'
import { Button } from '@/shared/ui/button'
import { Field, Input, Textarea } from '@/shared/ui/input'

/** Одна или несколько заявок в одном сообщении. data-nav — порядок перехода по Enter. */
export function ItemFields() {
  const { control, register, formState } = useFormContext<FormValues>()
  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
  const errors = formState.errors.items

  return (
    <div className="grid gap-2.5">
      {fields.map((item, index) => (
        <div key={item.id} className="grid gap-3 rounded-xl border border-border bg-surface p-3.5">
          <div className="flex items-center justify-between">
            <b className="text-sm">{fields.length > 1 ? `Заявка ${index + 1}` : 'Заявка'}</b>
            {fields.length > 1 && (
              <Button variant="danger" size="sm" onClick={() => remove(index)}>
                Убрать
              </Button>
            )}
          </div>
          {ITEM_FIELDS.map((name) => {
            const meta = ITEM_LABELS[name]
            const error = errors?.[index]?.[name]?.message
            const props = { ...register(`items.${index}.${name}`), placeholder: meta.placeholder, 'data-nav': '', 'aria-invalid': !!error }
            return (
              <Field key={name} label={meta.title} required={meta.required} hint={meta.hint} error={error}>
                {meta.rows ? <Textarea rows={meta.rows} {...props} /> : <Input autoComplete="off" {...props} />}
              </Field>
            )
          })}
        </div>
      ))}
      <Button className="justify-self-start border-dashed" onClick={() => append(emptyItem(), { shouldFocus: true })}>
        + Ещё заявка в это же сообщение
      </Button>
    </div>
  )
}
