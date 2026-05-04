/**
 * Сайдбар для публичной страницы записи /m/:slug.
 * Визуал выровнен с dedato-public-master-page-preview-v2 (.master-card).
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
      <div
        className="sticky top-28 rounded-[18px] border border-[#E8E2DD] bg-white p-[22px] space-y-0"
        style={{ boxShadow: '0 12px 28px -18px rgba(24,24,24,.20)' }}
      >
        <div className="flex justify-center mb-[18px]" data-testid="public-master-photo">
          {ownerInfo.logo ? (
            <img
              src={getImageUrl(ownerInfo.logo)}
              alt={ownerInfo.name}
              className="w-[120px] h-[120px] rounded-[14px] object-cover border border-[#E8E8ED] mt-0.5"
            />
          ) : (
            <div
              className="w-[120px] h-[120px] rounded-[14px] border border-[#E8E8ED] flex items-center justify-center mt-0.5 bg-gradient-to-b from-[#F4F5F8] to-[#EFF1F5]"
              role="img"
              aria-label={ownerInfo.name ? `Фото: ${ownerInfo.name} (не загружено)` : 'Фото мастера не загружено'}
            >
              <UserCircleIcon className="w-[58px] h-[58px] text-[#9AA0AE]" />
            </div>
          )}
        </div>

        <div className="text-center px-0.5">
          <div className="text-[18px] font-bold text-[#222222] tracking-tight leading-[1.15]">{ownerInfo.name}</div>
          <p className="mt-1.5 text-sm text-[#66686F] leading-snug whitespace-pre-wrap line-clamp-4">
            {descriptionText || 'Мастер принимает по записи'}
          </p>
        </div>

        {(hasLocation || hasPhone || hasMaps) && (
          <div className="mt-6 flex flex-col gap-5" data-testid="public-master-contacts">
            {hasPhone && (
              <div>
                <h3 className="text-[11px] font-bold text-[#6F7480] uppercase tracking-[0.06em] mb-2">Телефон</h3>
                <a
                  href={`tel:${ownerInfo.phone}`}
                  className="text-[15px] font-semibold text-[#4CAF50] hover:text-[#45A049]"
                >
                  {ownerInfo.phone}
                </a>
              </div>
            )}

            {hasLocation && (
              <div data-testid="public-master-address">
                <h3 className="text-[11px] font-bold text-[#6F7480] uppercase tracking-[0.06em] mb-2">Адрес</h3>
                {addressLine && (
                  hasMaps ? (
                    <a
                      href={ownerInfo.yandex_maps_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[15px] font-medium text-[#222222] underline decoration-dotted underline-offset-2 hover:text-neutral-900"
                    >
                      {addressLine}
                    </a>
                  ) : (
                    <p className="text-[15px] font-medium text-[#222222]">{addressLine}</p>
                  )
                )}

                {ownerInfo.address_detail && String(ownerInfo.address_detail).trim() && (
                  <p className="text-[12.5px] text-[#66686F] whitespace-pre-wrap mt-1.5 leading-snug">
                    {ownerInfo.address_detail}
                  </p>
                )}

                {hasMaps && (
                  <a
                    href={ownerInfo.yandex_maps_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2.5 flex items-center justify-center min-h-[42px] rounded-[10px] bg-[#EEF8F0] text-[#2F7C43] text-sm font-medium border border-[#E2F1E4] hover:bg-[#E4F4E8] transition-colors w-full"
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
          <div className="mt-5" data-testid="public-master-timezone">
            <h3 className="text-[11px] font-bold text-[#6F7480] uppercase tracking-[0.06em] mb-2">Время записи</h3>
            <p className="text-[15px] font-medium text-[#222222]">{formatTimezoneLabel(masterTimezone)}</p>
          </div>
        )}
      </div>
    </aside>
  )
}
