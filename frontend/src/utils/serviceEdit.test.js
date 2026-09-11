import { describe, expect, it } from 'vitest'
import { parseServicePrice, serviceEditError } from '../../../shared/serviceEdit'

describe('service edit input contract', () => {
  it.each([['100', 100], ['100.5', 100.5], ['100,5', 100.5], ['100.50', 100.5], ['100,50', 100.5], [0, 0], ['0', 0]])('parses %s exactly', (input, expected) => {
    expect(parseServicePrice(input)).toBe(expected)
  })
  it.each(['100,5,2', '100abc', '-1', '', null, undefined, 'NaN', 'Infinity', '1e3', '1.2.3'])('rejects malformed %s', input => {
    expect(parseServicePrice(input)).toBeNull()
  })
  it.each([
    [{ loc: ['body', 'price'], msg: 'private internal detail', input: 'private value' }],
    { loc: ['body', 'price'], stack: 'private stack' },
  ])('structured detail uses only recognized field metadata', detail => {
    expect(serviceEditError({ response: { data: { detail } } })).toBe('Проверьте поля: Цена.')
  })
  it.each([{}, null, ['private value'], 'private stack', { loc: [{ toString: 'invalid field' }] }])('unknown detail has a safe fallback', detail => {
    const message = serviceEditError({ response: { data: { detail } } })
    expect(message).toBe('Не удалось сохранить услугу. Проверьте данные и повторите попытку.')
  })
})
