export function focusSelf(event: Event) {
  event.preventDefault()
  if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus()
}
