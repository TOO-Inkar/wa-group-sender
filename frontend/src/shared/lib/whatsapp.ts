const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c)
}

/**
 * Разметка WhatsApp в HTML: ```моно```, *жирный*, _курсив_, ~зачёркнутый~. Как в самом WhatsApp, знак работает,
 * если снаружи к нему не прилегает буква или цифра, а внутри он касается текста. Текст экранируется до разметки,
 * поэтому результат безопасно вставлять как HTML.
 */
export function whatsappToHtml(text: string): string {
  const inline = (source: string, mark: string, tag: string) => {
    const m = mark === '*' ? '\\*' : mark
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${m}(?=\\S)([^\\n]*?\\S)${m}(?![\\p{L}\\p{N}])`, 'gu')
    return source.replace(re, `<${tag}>$1</${tag}>`)
  }
  let html = escapeHtml(text).replace(/```([\s\S]+?)```/g, '<code>$1</code>')
  html = inline(html, '*', 'b')
  html = inline(html, '_', 'i')
  html = inline(html, '~', 's')
  return html
}
