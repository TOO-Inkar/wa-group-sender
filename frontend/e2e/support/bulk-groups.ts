import type { Page } from '@playwright/test'

export const BULK_PREFIX = 'Большая группа'

export const bulkGroups = (total: number) =>
  Array.from({ length: total }, (_, i) => ({
    jid: `${120363500000000 + i}@g.us`,
    name: `${BULK_PREFIX} ${i + 1}`,
    archived: true,
    member: true,
    canSend: true,
    active: true,
    lastSync: '2026-11-03T23:32:04Z',
    participants: 40,
    community: false,
    tooLarge: false,
    rejectedCount: 0,
    rejected: false,
    blockedBy: null,
  }))

export async function mockBulkGroups(page: Page, total: number) {
  const json = bulkGroups(total)
  await page.route('**/api/groups?*', (route) => route.fulfill({ json }))
  await page.route('**/api/groups', (route) => route.fulfill({ json }))
  return json
}
