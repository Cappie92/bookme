import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import PublicBookingSidebar from '../components/booking/PublicBookingSidebar'
import { formatPublicAddressLine } from './publicAddressDisplay'

const sourceRoot = fileURLToPath(new URL('../', import.meta.url))
const read = (relative) => readFileSync(join(sourceRoot, relative), 'utf8')

describe('address without legacy Maps APIs', () => {
  it('renders the actual public address as an ordinary map link', () => {
    const url = `https://yandex.ru/maps/?text=${encodeURIComponent('Москва, ул. Тверская, 10')}`
    const html = renderToStaticMarkup(React.createElement(PublicBookingSidebar, {
      ownerInfo: {
        name: 'Тестовый мастер', city: 'Москва', address: 'ул. Тверская, 10',
        address_detail: 'Вход со двора', yandex_maps_url: url,
      },
    }))
    expect(html).toContain(`href="${url}"`)
    expect(html).toContain('Москва, ул. Тверская, 10')
    expect(html).toContain('Вход со двора')
    expect(html).toContain('Открыть в Яндекс Картах')
    expect(html).not.toMatch(/<iframe|<script|apikey=/)
  })

  it.each([
    ['Москва', 'ул. Тверская, 10', 'Москва, ул. Тверская, 10'],
    ['Москва', 'Москва, ул. Тверская, 10', 'Москва, ул. Тверская, 10'],
    ['', 'ул. Тверская, 10', 'ул. Тверская, 10'],
    ['Москва', '', 'Москва'],
    ['', '', ''],
  ])('renders a string address (%s / %s)', (city, address, expected) => {
    expect(formatPublicAddressLine(city, address)).toBe(expected)
  })

  it('preserves settings save and public link consumers', () => {
    const settings = read('components/MasterSettings.jsx')
    expect(settings).toContain("apiFetch('/api/master/profile'")
    expect(settings).toContain("formData.append('address'")
    expect(settings).toContain("formData.append('address_detail'")
    expect(settings).toContain('https://yandex.ru/maps/?text=')
    expect(read('pages/MasterPublicBookingPage.jsx')).toContain('href={profile.yandex_maps_url}')
    expect(read('components/booking/PublicBookingSidebar.jsx')).toContain('href={ownerInfo.yandex_maps_url}')
  })

  it('has no executable diagnostic route, SDK, Suggest or Geocoder consumer', () => {
    const retired = /YandexGeocoderTest|YandexApiStatus|\/api\/geocoder|\/api\/extract-address|suggest-maps\.yandex|geocode-maps\.yandex|api-maps\.yandex|VITE_YANDEX_MAPS_API_KEY|VITE_YANDEX_SUGGEST_API_KEY/
    const visit = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) visit(path)
        else if (/\.(jsx?|tsx?)$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name)) {
          expect(readFileSync(path, 'utf8'), path).not.toMatch(retired)
        }
      }
    }
    visit(sourceRoot)
  })
})
