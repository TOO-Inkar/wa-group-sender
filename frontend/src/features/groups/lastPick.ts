const LAST_PICK_KEY = 'wa.lastGroupPick'

export function lastGroupPick(): string[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(LAST_PICK_KEY) ?? '[]')
    return Array.isArray(stored) ? stored.filter((jid): jid is string => typeof jid === 'string') : []
  } catch {
    return []
  }
}

export function rememberGroupPick(jids: string[]) {
  try {
    localStorage.setItem(LAST_PICK_KEY, JSON.stringify(jids))
  } catch {
    return
  }
}
