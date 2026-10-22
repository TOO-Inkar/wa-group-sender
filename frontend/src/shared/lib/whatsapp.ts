const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c)
}

export function whatsappToHtml(text: string): string {
  // Как в WhatsApp: знак не должен касаться букв снаружи и должен касаться текста внутри.
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
