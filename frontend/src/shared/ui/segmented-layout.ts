export const PHONE_ROW_MAX_OPTIONS = 3
export const PHONE_ROW_MAX_CHARS = 28

export type SegmentOption<T extends string = string> = { value: T; label: string; count?: number }

export function fitsPhoneRow(options: SegmentOption[]): boolean {
  const chars = options.reduce((sum, o) => sum + o.label.length + String(o.count ?? '').length, 0)
  return options.length <= PHONE_ROW_MAX_OPTIONS && chars <= PHONE_ROW_MAX_CHARS
}
