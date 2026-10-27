import type { Group } from '@/shared/api/types'

export function sendable(group: Group): boolean {
  return group.member === true && group.canSend === true && !group.community && !group.tooLarge && !group.rejected
}

export function matches(group: Group, query: string): boolean {
  const q = query.trim().toLowerCase()
  return !q || (group.name ?? '').toLowerCase().includes(q)
}

export function sortGroups(groups: Group[]): Group[] {
  return [...groups].sort((a, b) => Number(!a.name) - Number(!b.name) || (a.name ?? a.jid).localeCompare(b.name ?? b.jid, 'ru', { numeric: true }))
}

export type GroupFilter = 'all' | 'active' | 'blocked' | 'selected'

export function matchesGroupFilter(g: Group, filter: GroupFilter, selected: Set<string>): boolean {
  if (filter === 'active') return g.active
  if (filter === 'blocked') return !g.active
  if (filter === 'selected') return selected.has(g.jid)
  return true
}
