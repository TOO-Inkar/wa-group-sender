import { expect, type Page } from '@playwright/test'

export const EDGE_TOLERANCE_PX = 1
export const CENTER_TOLERANCE_PX = 1
export const MIN_TEXT_CONTRAST = 4.5
export const DESKTOP_CONTROL_PX = { min: 32, max: 36 }
export const TOUCH_CONTROL_MIN_PX = 44
export const MIN_CARD_WIDTH_PX = 120
export const MAX_EXAMPLES = 3

const LIMITS = {
  edge: EDGE_TOLERANCE_PX,
  center: CENTER_TOLERANCE_PX,
  contrast: MIN_TEXT_CONTRAST,
  desktop: DESKTOP_CONTROL_PX,
  touch: TOUCH_CONTROL_MIN_PX,
  cardWidth: MIN_CARD_WIDTH_PX,
}

type Limits = typeof LIMITS
type Finding = { key: string; text: string }
export type Report = Record<CheckName, Finding[]>
export type CheckName =
  | 'pageScroll'
  | 'cardOverflow'
  | 'chevrons'
  | 'iconCentering'
  | 'tabs'
  | 'contrast'
  | 'controlHeights'

export const CHECKS: Record<CheckName, string> = {
  pageScroll: 'нет горизонтального скролла страницы',
  cardOverflow: 'потомки карточек не выходят за карточку по x',
  chevrons: 'шеврон select/dropdown внутри поля',
  iconCentering: 'иконка по центру с соседним текстом/полем',
  tabs: 'пункты табов/сегментов одинаковые и в одну линию',
  contrast: `контраст текста ≥ ${MIN_TEXT_CONTRAST}:1`,
  controlHeights: `высота контролов ${DESKTOP_CONTROL_PX.min}–${DESKTOP_CONTROL_PX.max}px (pointer: fine) / ≥ ${TOUCH_CONTROL_MIN_PX}px (pointer: coarse)`,
}

function measure(limits: Limits): Report {
  const report: Report = {
    pageScroll: [],
    cardOverflow: [],
    chevrons: [],
    iconCentering: [],
    tabs: [],
    contrast: [],
    controlHeights: [],
  }
  const r1 = (n: number) => Math.round(n * 10) / 10
  const INTERACTIVE =
    'button,a,input,select,textarea,label,[role=button],[role=radio],[role=tab],[role=option],[role=menuitem],[role=menuitemradio],[role=menuitemcheckbox]'
  const CONTROL = 'button,a,select,input,[role=button],[role=radio],[role=tab],[role=combobox],[aria-haspopup]'
  const FORM_FIELD = 'input,select,textarea,button,[role=combobox],[aria-haspopup]'
  const ROW = 'tr,li,[role=row],[role=listitem],label'

  const inScope = (el: Element) => !el.closest('[data-aria-hidden="true"],[inert]')
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect()
    return r.width >= 2 && r.height >= 2 && el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
  }
  const all = (root: ParentNode, selector = '*') =>
    Array.from(root.querySelectorAll(selector)).filter((el) => inScope(el) && visible(el))
  const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()
  const name = (el: Element): string => {
    const tag = el.tagName.toLowerCase()
    const label = clean(el.getAttribute('aria-label') ?? el.getAttribute('title') ?? el.getAttribute('placeholder'))
    if (label) return `<${tag}> «${label.slice(0, 50)}»`
    const text = clean(el instanceof HTMLElement ? el.innerText : el.textContent)
    if (text) return `<${tag}> "${text.slice(0, 50)}"`
    const cls = clean(el.getAttribute('class')).split(' ').slice(0, 3).join('.')
    const parent = el.parentElement && el.parentElement !== document.body ? ` в ${name(el.parentElement)}` : ''
    return `<${tag}${cls ? `.${cls}` : ''}>${parent}`
  }
  const boxText = (r: DOMRect) => `x ${r1(r.left)}..${r1(r.right)}, y ${r1(r.top)}..${r1(r.bottom)}`
  const centerY = (r: { top: number; bottom: number }) => (r.top + r.bottom) / 2
  const union = (rects: DOMRect[]) => {
    const top = Math.min(...rects.map((r) => r.top))
    const bottom = Math.max(...rects.map((r) => r.bottom))
    const left = Math.min(...rects.map((r) => r.left))
    const right = Math.max(...rects.map((r) => r.right))
    return new DOMRect(left, top, right - left, bottom - top)
  }
  const textRects = (node: Node) => {
    const range = document.createRange()
    range.selectNodeContents(node)
    return Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0)
  }

  const canvas = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!
  type Rgba = [number, number, number, number]
  const rgba = (css: string): Rgba => {
    canvas.clearRect(0, 0, 1, 1)
    canvas.fillStyle = '#000'
    canvas.fillStyle = css
    canvas.fillRect(0, 0, 1, 1)
    const [r = 0, g = 0, b = 0, a = 0] = canvas.getImageData(0, 0, 1, 1).data
    return [r, g, b, a / 255]
  }
  const over = (top: Rgba, bottom: Rgba): Rgba => {
    const a = top[3] + bottom[3] * (1 - top[3])
    if (!a) return [0, 0, 0, 0]
    const mix = (i: 0 | 1 | 2) => (top[i] * top[3] + bottom[i] * bottom[3] * (1 - top[3])) / a
    return [mix(0), mix(1), mix(2), a]
  }
  const background = (el: Element | null): Rgba => {
    const layers: Rgba[] = []
    for (let node = el; node; node = node.parentElement) {
      const c = rgba(getComputedStyle(node).backgroundColor)
      if (c[3] > 0) layers.push(c)
      if (c[3] >= 1) break
    }
    return layers.reduceRight<Rgba>((acc, layer) => over(layer, acc), [255, 255, 255, 1])
  }
  const luminance = ([r, g, b]: Rgba) => {
    const ch = (v: number) => {
      const s = v / 255
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)
  }
  const contrast = (a: Rgba, b: Rgba) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
    return (hi + 0.05) / (lo + 0.05)
  }
  const hex = (c: Rgba) =>
    `#${c
      .slice(0, 3)
      .map((v) => Math.round(v).toString(16).padStart(2, '0'))
      .join('')}`
  const opacity = (el: Element) => {
    let value = 1
    for (let node: Element | null = el; node; node = node.parentElement) value *= Number(getComputedStyle(node).opacity)
    return value
  }

  const overflow = document.documentElement.scrollWidth - window.innerWidth
  if (overflow > 0) {
    const wide = Array.from(document.body.querySelectorAll('*'))
      .filter((el) => visible(el))
      .filter(
        (el) =>
          el.getBoundingClientRect().right > window.innerWidth + limits.edge &&
          getComputedStyle(el).position !== 'fixed',
      )
    const outer = wide.filter((el) => !wide.some((p) => p !== el && p.contains(el)))
    report.pageScroll.push({
      key: 'page',
      text: `scrollWidth ${document.documentElement.scrollWidth} > innerWidth ${window.innerWidth}; шире окна: ${
        outer
          .slice(0, 3)
          .map((el) => `${name(el)} до ${r1(el.getBoundingClientRect().right)}px`)
          .join('; ') || '—'
      }`,
    })
  }

  const isCard = (el: Element) => {
    if (el.matches('[role=dialog],[role=alertdialog],[data-card]')) return true
    if (el.matches(INTERACTIVE) || !el.firstElementChild) return false
    const s = getComputedStyle(el)
    if (parseFloat(s.borderTopLeftRadius) <= 0 || el.getBoundingClientRect().width < limits.cardWidth) return false
    const sides = ['Top', 'Right', 'Bottom', 'Left'] as const
    const bordered = sides.every(
      (side) =>
        parseFloat(s.getPropertyValue(`border-${side.toLowerCase()}-width`)) > 0 &&
        rgba(s.getPropertyValue(`border-${side.toLowerCase()}-color`))[3] > 0,
    )
    const own = rgba(s.backgroundColor)
    const raised = own[3] > 0 && hex(background(el)) !== hex(background(el.parentElement))
    return bordered || raised
  }
  const clipX = (el: Element, stop: Element) => {
    const r = el.getBoundingClientRect()
    let [left, right] = [r.left, r.right]
    for (let node = el.parentElement; node && node !== stop; node = node.parentElement)
      if (getComputedStyle(node).overflowX !== 'visible') {
        const p = node.getBoundingClientRect()
        left = Math.max(left, p.left)
        right = Math.min(right, p.right)
      }
    return { left, right }
  }
  for (const card of all(document.body).filter(isCard)) {
    const c = card.getBoundingClientRect()
    const reported: Element[] = []
    for (const child of all(card)) {
      if (getComputedStyle(child).position === 'fixed' || reported.some((p) => p.contains(child))) continue
      const { left, right } = clipX(child, card)
      if (right <= left) continue
      const out = Math.max(c.left - left, right - c.right)
      if (out > limits.edge) {
        reported.push(child)
        report.cardOverflow.push({
          key: `${name(card)}|${name(child)}`,
          text: `${name(child)} торчит из карточки ${name(card)} на ${r1(out)}px (элемент x ${r1(left)}..${r1(right)}, карточка x ${r1(c.left)}..${r1(c.right)})`,
        })
      }
    }
    for (const scroller of [card, ...all(card)]) {
      const s = getComputedStyle(scroller)
      if (!['auto', 'scroll'].includes(s.overflowX) || scroller.scrollWidth <= scroller.clientWidth + limits.edge)
        continue
      const edge = scroller.getBoundingClientRect().right
      const wide = Array.from(scroller.querySelectorAll('*')).filter(
        (el) => visible(el) && el.getBoundingClientRect().right > edge + limits.edge,
      )
      const culprit = wide
        .filter((el) => el.getBoundingClientRect().width > scroller.clientWidth)
        .sort((a, b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length)[0]
      report.cardOverflow.push({
        key: `scroll|${name(scroller)}`,
        text: `горизонтальный скролл внутри карточки ${name(card)}: ${name(scroller)} scrollWidth ${scroller.scrollWidth} > clientWidth ${scroller.clientWidth}${culprit ? `, шире всех ${name(culprit)} шириной ${r1(culprit.getBoundingClientRect().width)}px` : ''}`,
      })
    }
  }

  for (const field of all(document.body, 'select,[aria-haspopup]')) {
    const icons =
      field instanceof HTMLSelectElement
        ? Array.from(field.parentElement?.children ?? []).filter((c) => c instanceof SVGSVGElement)
        : Array.from(field.querySelectorAll('svg'))
    const f = field.getBoundingClientRect()
    for (const icon of icons.filter(visible)) {
      const i = icon.getBoundingClientRect()
      const out = Math.max(f.left - i.left, i.right - f.right, f.top - i.top, i.bottom - f.bottom)
      if (out > limits.edge)
        report.chevrons.push({
          key: name(field),
          text: `шеврон ${name(icon)} вне поля ${name(field)} на ${r1(out)}px: шеврон ${boxText(i)}, поле ${boxText(f)}`,
        })
    }
  }

  const neighbour = (icon: Element) => {
    const siblings = (dir: 'previousSibling' | 'nextSibling') => {
      for (let n = icon[dir]; n; n = n[dir]) {
        if (n.nodeType === Node.TEXT_NODE && !clean(n.textContent)) continue
        if (
          n instanceof Element &&
          (n instanceof SVGSVGElement || !visible(n) || ['absolute', 'fixed'].includes(getComputedStyle(n).position))
        )
          continue
        return n
      }
      return null
    }
    for (const n of [siblings('nextSibling'), siblings('previousSibling')]) {
      if (!n) continue
      if (n instanceof Element && n.matches(FORM_FIELD))
        return { rect: n.getBoundingClientRect(), what: `поле ${name(n)}` }
      if (n instanceof Element && n.closest('[aria-hidden="true"]')) continue
      const rects = textRects(n)
      if (rects.length && clean(n.textContent))
        return { rect: union(rects), what: `текст "${clean(n.textContent).slice(0, 40)}"` }
    }
    const parent = icon.parentElement
    if (parent?.matches(CONTROL) && !clean(parent.textContent))
      return { rect: parent.getBoundingClientRect(), what: `кнопка ${name(parent)}` }
    return null
  }
  for (const icon of all(document.body, 'svg').filter((s) => !s.parentElement?.closest('svg'))) {
    const n = neighbour(icon)
    if (!n) continue
    const i = icon.getBoundingClientRect()
    const delta = centerY(i) - centerY(n.rect)
    if (Math.abs(delta) > limits.center)
      report.iconCentering.push({
        key: `${clean(icon.getAttribute('class'))}|${n.what}`,
        text: `иконка ${name(icon)} смещена на ${r1(delta)}px по вертикали от ${n.what}: центр иконки y=${r1(centerY(i))}, центр соседа y=${r1(centerY(n.rect))}`,
      })
  }
  for (const trigger of all(document.body, '[aria-haspopup=menu]').filter((t) => !clean(t.textContent))) {
    const row = trigger.closest(ROW)
    if (!row || !visible(row)) continue
    const t = trigger.getBoundingClientRect()
    const firstLine = Array.from(row.querySelectorAll('*'))
      .flatMap((el) => Array.from(el.childNodes))
      .find((n) => n.nodeType === Node.TEXT_NODE && clean(n.textContent))
    const targets = [
      row.getBoundingClientRect(),
      ...(firstLine ? [textRects(firstLine)[0]].filter((r): r is DOMRect => !!r) : []),
    ]
    const deltas = targets.map((r) => centerY(t) - centerY(r))
    if (deltas.every((d) => Math.abs(d) > limits.center))
      report.iconCentering.push({
        key: `row-menu|${trigger.getAttribute('aria-label')}`,
        text: `кнопка ${name(trigger)} не по центру строки ${name(row)}: смещение ${r1(deltas[0]!)}px от центра строки${deltas[1] === undefined ? '' : ` и ${r1(deltas[1])}px от первой строки текста`}`,
      })
  }

  const STYLE_KEYS = [
    'paddingTop',
    'paddingBottom',
    'paddingLeft',
    'paddingRight',
    'fontSize',
    'fontWeight',
    'fontFamily',
    'lineHeight',
  ] as const
  for (const group of all(document.body, '[role=radiogroup],[role=tablist]')) {
    const items = all(group, '[role=radio],[role=tab]')
    if (items.length < 2) continue
    const label = name(group)
    const describe = (el: Element) => {
      const s = getComputedStyle(el)
      return {
        height: String(r1(el.getBoundingClientRect().height)),
        ...Object.fromEntries(STYLE_KEYS.map((k) => [k, s[k]])),
      } as Record<string, string>
    }
    const base = describe(items[0]!)
    for (const item of items.slice(1)) {
      const d = describe(item)
      const diff = Object.keys(base).filter((k) => base[k] !== d[k])
      if (diff.length)
        report.tabs.push({
          key: `${label}|${diff.join(',')}`,
          text: `в ${label} пункт ${name(item)} отличается от ${name(items[0]!)}: ${diff.map((k) => `${k} ${d[k]} vs ${base[k]}`).join(', ')}`,
        })
    }
    const rows: Element[][] = []
    for (const item of items) {
      const r = item.getBoundingClientRect()
      const row = rows.find((cells) => Math.abs(centerY(cells[0]!.getBoundingClientRect()) - centerY(r)) < r.height / 2)
      if (row) row.push(item)
      else rows.push([item])
    }
    for (const row of rows) {
      const tops = row.map((el) => el.getBoundingClientRect().top)
      const spread = Math.max(...tops) - Math.min(...tops)
      if (spread > limits.edge)
        report.tabs.push({
          key: `${label}|top`,
          text: `в ${label} пункты одной строки на разной высоте: top ${tops.map(r1).join(', ')} (разброс ${r1(spread)}px)`,
        })
    }
    for (const item of items) {
      const text = Array.from(item.childNodes).find((n) => n.nodeType === Node.TEXT_NODE && clean(n.textContent))
      const rect = text && textRects(text)[0]
      if (!rect) continue
      const delta = centerY(rect) - centerY(item.getBoundingClientRect())
      if (Math.abs(delta) > limits.center)
        report.tabs.push({
          key: `${label}|text`,
          text: `в ${label} текст пункта ${name(item)} не по центру по вертикали: смещение ${r1(delta)}px`,
        })
    }
    const g = group.getBoundingClientRect()
    if (g.right > window.innerWidth + limits.edge || g.left < -limits.edge)
      report.tabs.push({
        key: `${label}|viewport`,
        text: `${label} выходит за окно: x ${r1(g.left)}..${r1(g.right)}, окно ${window.innerWidth}`,
      })
  }

  const disabled = (el: Element) => !!el.closest(':disabled,[aria-disabled="true"],[data-disabled]')
  const checkText = (el: Element, color: string, what: string) => {
    const fg = rgba(color)
    fg[3] *= opacity(el)
    const bg = background(el)
    const ratio = contrast(over(fg, bg), bg)
    if (ratio < limits.contrast)
      report.contrast.push({
        key: `${hex(over(fg, bg))}|${hex(bg)}`,
        text: `${what} ${name(el)}: ${ratio.toFixed(2)}:1 (текст ${hex(over(fg, bg))}, фон ${hex(bg)})`,
      })
  }
  for (const el of all(document.body)) {
    if (el.closest('svg,[aria-hidden="true"]') || disabled(el)) continue
    const own = Array.from(el.childNodes).some(
      (n) => n.nodeType === Node.TEXT_NODE && clean(n.textContent) && textRects(n).length,
    )
    if (own) checkText(el, getComputedStyle(el).color, 'текст')
    if ((el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && el.placeholder && !el.value)
      checkText(el, getComputedStyle(el, '::placeholder').color, 'placeholder')
  }

  const coarse = matchMedia('(pointer: coarse)').matches
  const stacked = (el: Element) => {
    const kids = Array.from(el.children)
      .filter(visible)
      .map((k) => k.getBoundingClientRect())
    return kids.some((a, i) =>
      kids.slice(i + 1).some((b) => b.top >= a.bottom - limits.edge || a.top >= b.bottom - limits.edge),
    )
  }
  const plain = (el: Element) => {
    const s = getComputedStyle(el)
    const noBox = rgba(s.backgroundColor)[3] === 0 && parseFloat(s.borderTopWidth) === 0
    return noBox && (el.tagName === 'A' || (parseFloat(s.paddingLeft) === 0 && parseFloat(s.paddingRight) === 0))
  }
  const SKIP =
    'input[type=checkbox],input[type=radio],input[type=hidden],input[type=range],input[type=file],[role=menu] *,[role=listbox] *,nav a'
  for (const control of all(document.body, CONTROL)) {
    if (control.matches(SKIP) || stacked(control) || plain(control)) continue
    if (control.tagName === 'A' && getComputedStyle(control).display.includes('grid')) continue
    const h = control.getBoundingClientRect().height
    const ok = coarse
      ? h >= limits.touch - limits.edge / 2
      : h >= limits.desktop.min - limits.edge / 2 && h <= limits.desktop.max + limits.edge / 2
    if (!ok)
      report.controlHeights.push({
        key: `${control.tagName}|${r1(h)}|${clean(control.getAttribute('class')).slice(0, 60)}`,
        text: `${name(control)} высотой ${r1(h)}px, ${coarse ? `нужно ≥ ${limits.touch}px (pointer: coarse)` : `нужно ${limits.desktop.min}–${limits.desktop.max}px (pointer: fine)`}`,
      })
  }
  return report
}

export async function measureLayout(page: Page) {
  return page.evaluate(measure, LIMITS)
}

export function summarize(findings: Finding[]) {
  const groups = new Map<string, Finding[]>()
  for (const f of findings) groups.set(f.key, [...(groups.get(f.key) ?? []), f])
  return [...groups.values()].map((same) =>
    same.length > 1 ? `${same[0]!.text} (и ещё ${same.length - 1} таких же)` : same[0]!.text,
  )
}

export async function settleLayout(page: Page) {
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  )
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
}

export async function expectLayout(page: Page, scene: string, only?: CheckName[]) {
  await settleLayout(page)
  const report = await measureLayout(page)
  for (const check of only ?? (Object.keys(CHECKS) as CheckName[]))
    expect.soft(summarize(report[check]), `${scene}: ${CHECKS[check]}`).toEqual([])
  return report
}

export async function pointerIsCoarse(page: Page) {
  return page.evaluate(() => matchMedia('(pointer: coarse)').matches)
}

export function controlHeightOk(height: number, coarse: boolean) {
  return coarse ? height >= TOUCH_CONTROL_MIN_PX : height >= DESKTOP_CONTROL_PX.min && height <= DESKTOP_CONTROL_PX.max
}

export function controlHeightRule(coarse: boolean) {
  return coarse
    ? `нужно ≥ ${TOUCH_CONTROL_MIN_PX}px (pointer: coarse)`
    : `нужно ${DESKTOP_CONTROL_PX.min}–${DESKTOP_CONTROL_PX.max}px (pointer: fine)`
}
