export type Tone = 'neutral' | 'ok' | 'warn' | 'bad' | 'info'

export const toneSurface: Record<Tone, string> = {
  neutral: 'bg-neutral-bg text-muted',
  ok: 'bg-ok-bg text-ok-text',
  warn: 'bg-warn-bg text-warn-text',
  bad: 'bg-bad-bg text-bad-text',
  info: 'bg-info-bg text-info-text',
}

export const toneDot: Record<Tone, string> = {
  neutral: 'bg-neutral-bg',
  ok: 'bg-accent',
  warn: 'bg-[#e0a030]',
  bad: 'bg-danger',
  info: 'bg-info-text',
}
