import { describe, expect, it } from 'vitest'
import { whatsappToHtml } from './whatsapp'

describe('разметка WhatsApp', () => {
  it('жирный, курсив, зачёркнутый — как в WhatsApp', () => {
    expect(whatsappToHtml('📍*ХОРГОС*')).toBe('📍<b>ХОРГОС</b>')
    expect(whatsappToHtml('_тихо_ ~нет~')).toBe('<i>тихо</i> <s>нет</s>')
    expect(whatsappToHtml('3 * 4 и snake_case_name')).toBe('3 * 4 и snake_case_name')
  })

  it('HTML экранируется до разметки', () => {
    expect(whatsappToHtml('<script>*x*</script>')).toBe('&lt;script&gt;<b>x</b>&lt;/script&gt;')
  })
})
