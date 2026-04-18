/**
 * Сайдбар для публичной страницы записи /m/:slug.
 * Только публичные данные (профиль мастера), без запросов к /api/client/* (notes, favorites и т.д.).
 */
import React from 'react'
import { UserCircleIcon } from '@heroicons/react/24/outline'
import { getImageUrl } from '../../utils/config'
import { formatTimezoneLabel } from '../../utils/dateFormat'
import { formatPublicAddressLine } from '../../utils/publicAddressDisplay'

export default function PublicBookingSidebar({
  ownerInfo,
  /** IANA timezone мастера (например Europe/Moscow) */
  masterTimezone = null,
}) {
  if (!ownerInfo) return null

  const description = ownerInfo.site_description || ownerInfo.description
  const descriptionText = description && String(description).trim() ? String(description).trim() : null
  const hasLocation = Boolean(ownerInfo.address || ownerInfo.city || ownerInfo.address_detail)
  const hasMaps = Boolean(ownerInfo.yandex_maps_url)
  const hasPhone = Boolean(ownerInfo.phone)
  const addressLine = formatPublicAddressLine(ownerInfo.city, ownerInfo.address)

  return (
    <aside className="hidden md:block w-[320px] shrink-0" data-testid="public-booking-sidebar">
      <div className="sticky top-28 rounded-xl border border-gray-200 bg-white shadow-sm p-4 space-y-4">
        <div className="flex justify-center" data-testid="public-master-photo">
          {ownerInfo.logo ? (
            <img
              src={getImageUrl(ownerInfo.logo)}
              alt={ownerInfo.name}
              className="w-[108px] h-[108px] rounded-lg object-cover"
            />
          ) : (
            <div
              className="w-[108px] h-[108px] rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center"
              role="img"
              aria-label={ownerInfo.name ? `Фото: ${ownerInfo.name} (не загружено)` : 'Фото мастера не загружено'}
            >
              <UserCircleIcon className="w-14 h-14 text-gray-400" />
            </div>
          )}
        </div>

        <div className="space-y-1">
          <div className="text-base font-semibold text-gray-900">{ownerInfo.name}</div>
          <p className="text-sm text-gray-600 whitespace-pre-wrap line-clamp-3">
            {descriptionText || 'Мастер принимает по записи'}
          </p>
        </div>

        {(hasLocation || hasPhone || hasMaps) && (
          <div className="space-y-2.5" data-testid="public-master-contacts">
            {hasPhone && (
              <div>
                <h3 className="text-[11px] font-semibold text-gray-500 uppercase mb-1">Телефон</h3>
                <a
                  href={`tel:${ownerInfo.phone}`}
                  className="text-sm text-[#4CAF50] hover:text-[#43a047] font-semibold"
                >
                  {ownerInfo.phone}
                </a>
              </div>
            )}

            {hasLocation && (
              <div data-testid="public-master-address">
                <h3 className="text-[11px] font-semibold text-gray-500 uppercase mb-1">Адрес</h3>
                {addressLine && (
                  hasMaps ? (
                    <a
                      href={ownerInfo.yandex_maps_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-gray-700 hover:text-gray-900 underline decoration-dotted underline-offset-2"
                    >
                      {addressLine}
                    </a>
                  ) : (
                    <p className="text-sm text-gray-700">{addressLine}</p>
                  )
                )}

                {ownerInfo.address_detail && String(ownerInfo.address_detail).trim() && (
                  <p className="text-sm text-gray-600 whitespace-pre-wrap mt-1.5">
                    {ownerInfo.address_detail}
                  </p>
                )}

                {hasMaps && (
                  <a
                    href={ownerInfo.yandex_maps_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-medium bg-[#4CAF50]/10 text-[#2f7d32] hover:bg-[#4CAF50]/15 w-full"
                    data-testid="public-master-open-yandex"
                  >
                    Открыть в Яндекс Картах
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        {masterTimezone && (
          <div data-testid="public-master-timezone">
            <h3 className="text-[11px] font-semibold text-gray-500 uppercase mb-1">Время записи</h3>
            <p className="text-sm text-gray-600">{formatTimezoneLabel(masterTimezone)}</p>
          </div>
        )}

        {/* phone moved to contacts block above */}
      </div>
    </aside>
  )
}
