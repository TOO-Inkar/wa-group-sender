import { useState } from 'react'
import { useFormContext, useWatch } from 'react-hook-form'
import type { FormValues } from '../form'
import { GroupPickerDialog } from '@/features/groups/GroupPickerDialog'
import { useGroupLists } from '@/features/groups/api'
import { useHealth } from '@/features/health/api'
import { plural } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Select } from '@/shared/ui/input'
import { Segmented } from '@/shared/ui/segmented'

/** Куда: все группы · список · выбрать — одной строкой, нужное поле рядом. */
export function WherePicker() {
  const { setValue, control, formState, register } = useFormContext<FormValues>()
  const [target, groups] = useWatch({ control, name: ['target', 'groups'] })
  const [picking, setPicking] = useState(false)
  const { data: lists = [] } = useGroupLists()
  const { data: health } = useHealth()
  const error = formState.errors.listId?.message ?? formState.errors.groups?.message

  return (
    <div className="grid gap-1.5">
      <span className="text-[13px] font-medium text-muted">Куда</span>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          value={target}
          onChange={(v) => {
            setValue('target', v)
            if (v === 'pick' && !groups.length) setPicking(true)
          }}
          options={[
            { value: 'all', label: 'Все группы', count: health?.activeGroups },
            { value: 'list', label: 'Список' },
            { value: 'pick', label: 'Выбрать' },
          ]}
        />
        {target === 'list' && (
          <Select className="py-1.5 text-sm" aria-invalid={!!error} {...register('listId')}>
            <option value="">{lists.length ? '— список —' : 'списков нет'}</option>
            {lists.map((l) => (
              <option key={l.id} value={String(l.id)}>
                {l.name} · {l.groups.length}
              </option>
            ))}
          </Select>
        )}
        {target === 'pick' && (
          <Button size="sm" onClick={() => setPicking(true)}>
            {groups.length ? `${plural(groups.length, 'группа', 'группы', 'групп')} · изменить` : 'Выбрать группы…'}
          </Button>
        )}
      </div>
      {error && <span className="text-[13px] text-danger">{error}</span>}
      <GroupPickerDialog open={picking} onOpenChange={setPicking} value={groups} onChange={(jids) => setValue('groups', jids, { shouldValidate: formState.isSubmitted })} />
    </div>
  )
}
