import type { Locator } from '@playwright/test'

export async function selectOptionByPartialText(select: Locator, partialText: string) {
  const opt = select.locator('option', { hasText: partialText }).first()
  const value = await opt.getAttribute('value')
  if (!value) throw new Error(`Option with text "${partialText}" not found or has no value`)
  await select.selectOption(value)
}
