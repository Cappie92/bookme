/**
 * Публичная страница записи к мастеру: /m/:slug
 * Master-only. Slug = masters.domain.
 * SEO: title, description, og, canonical.
 */
import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import Header from '../components/Header'
import Footer from '../components/Footer'
import PublicBookingWizard from '../components/booking/PublicBookingWizard'
import PublicBookingSidebar from '../components/booking/PublicBookingSidebar'
import ErrorBoundary from '../components/ErrorBoundary'
import { useAuth } from '../contexts/AuthContext'
import { formatPublicAddressLine } from '../utils/publicAddressDisplay'

const API_BASE = '/api/public/masters'

/** Canonical URL для страницы (поддержка будущего subdomain) */
function buildCanonicalUrl(slug) {
  if (typeof window === 'undefined') return `https://dedato.ru/m/${slug}`
  const origin = window.location.origin
  return `${origin}/m/${slug}`
}

export default function MasterPublicBookingPage() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { user: currentUser, openAuthModal } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [profile, setProfile] = useState(null)
  const [eligibility, setEligibility] = useState(null)
  const [clientNote, setClientNote] = useState(null)
  const [showAppBanner, setShowAppBanner] = useState(false)

  useEffect(() => {
    if (slug) loadProfile()
  }, [slug])

  useEffect(() => {
    if (!slug || !profile) return
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768
    const dismissed = sessionStorage.getItem(`app-banner-dismissed-${slug}`)
    setShowAppBanner(isMobile && !dismissed)
  }, [slug, profile])

  useEffect(() => {
    if (profile && currentUser) {
      loadEligibility()
      loadClientNote()
    }
  }, [profile, currentUser])

  const loadProfile = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/${slug}`)
      if (!res.ok) {
        if (res.status === 404) {
          setError({ kind: 'not_found', title: 'Мастер не найден', message: 'Проверьте ссылку и попробуйте ещё раз.' })
        } else {
          setError({
            kind: 'load_failed',
            title: 'Не удалось загрузить страницу',
            message: 'Проверьте интернет и попробуйте ещё раз.',
          })
        }
        setLoading(false)
        return
      }
      const data = await res.json()
      setProfile(data)
    } catch (err) {
      console.error('Ошибка загрузки профиля:', err)
      setError({
        kind: 'load_failed',
        title: 'Не удалось загрузить страницу',
        message: 'Проверьте интернет и попробуйте ещё раз.',
      })
    } finally {
      setLoading(false)
    }
  }

  const loadEligibility = async () => {
    if (!slug || !currentUser) return
    try {
      const token = localStorage.getItem('access_token')
      const res = await fetch(`${API_BASE}/${slug}/eligibility`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      })
      if (res.ok) {
        const data = await res.json()
        setEligibility(data)
      }
    } catch (err) {
      console.error('Ошибка загрузки eligibility:', err)
    }
  }

  const loadClientNote = async () => {
    if (!slug || !currentUser) return
    try {
      const token = localStorage.getItem('access_token')
      const res = await fetch(`${API_BASE}/${slug}/client-note`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      })
      if (res.ok) {
        const data = await res.json()
        setClientNote(data.note_text)
      }
    } catch (err) {
      console.error('Ошибка загрузки заметки:', err)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F9F7F6] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#4CAF50] mx-auto mb-4" />
          <p className="text-gray-600">Загрузка...</p>
        </div>
      </div>
    )
  }

  if ((error && error.kind === 'not_found') || (!profile && error && error.kind !== 'load_failed')) {
    navigate('/404', { replace: true })
    return null
  }

  if ((error && error.kind === 'load_failed') || !profile) {
    const title = error?.title || 'Не удалось загрузить страницу'
    const message = error?.message || 'Попробуйте ещё раз.'
    return (
      <div className="min-h-screen flex flex-col bg-white">
        <Header compactPublicBooking />
        <main className="pt-24 max-md:pt-14">
          <div className="max-w-3xl mx-auto w-full px-4 pb-10">
            <div className="rounded-2xl border border-neutral-200 bg-white p-6 md:p-8 shadow-sm">
              <h1 className="text-xl md:text-2xl font-semibold text-neutral-900">{title}</h1>
              <p className="mt-2 text-sm text-neutral-600">{message}</p>
              <div className="mt-5">
                <button
                  type="button"
                  onClick={loadProfile}
                  className="inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold bg-[#4CAF50] text-white hover:bg-[#45a049]"
                  data-testid="public-retry"
                >
                  Повторить
                </button>
              </div>
            </div>
          </div>
        </main>
        <div className="hidden md:block">
          <Footer compact />
        </div>
      </div>
    )
  }

  const title = `Запись к ${profile.master_name} | DeDato`
  const description = profile.description || `Запись к мастеру ${profile.master_name}. ${profile.city ? profile.city + '.' : ''}`
  const publicAddressLine = formatPublicAddressLine(profile.city, profile.address)

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={buildCanonicalUrl(slug)} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={buildCanonicalUrl(slug)} />
        <meta property="og:type" content="website" />
      </Helmet>

      <Header compactPublicBooking />

      {/* Smart banner: под компактным mobile header (h-12 = 3rem), высота ~3.5rem для расчёта offset main. */}
      {showAppBanner && (
        <div
          className="fixed left-0 right-0 z-40 bg-white/95 backdrop-blur border-b border-gray-200 shadow-sm px-4 flex items-center justify-between gap-4 md:hidden"
          style={{
            top: 'calc(3rem + env(safe-area-inset-top, 0px))',
            minHeight: '3.5rem',
          }}
        >
          <span className="text-sm text-gray-700">Откройте в приложении DeDato</span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                window.location.href = `dedato://m/${slug}`
              }}
              className="px-3 py-1.5 text-sm font-medium text-white bg-[#4CAF50] rounded-lg hover:bg-[#45a049]"
            >
              Открыть
            </button>
            <button
              type="button"
              onClick={() => {
                sessionStorage.setItem(`app-banner-dismissed-${slug}`, '1')
                setShowAppBanner(false)
              }}
              className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-600"
            >
              Продолжить в браузере
            </button>
          </div>
        </div>
      )}

      {/* main: desktop pt-32; mobile — компактный header 3rem + зазор / баннер */}
      <main
        className={
          'flex-grow pt-32 ' +
          (showAppBanner
            ? 'max-md:pt-[calc(7.5rem+env(safe-area-inset-top,0px))]'
            : 'max-md:pt-[calc(4rem+env(safe-area-inset-top,0px))]')
        }
      >
        <div className="max-w-5xl mx-auto w-full px-4 pt-2 sm:pt-3 pb-10">
          <div className="grid md:grid-cols-[320px_minmax(0,1fr)] md:gap-6 items-start">
            <PublicBookingSidebar
              ownerInfo={{
                name: profile.master_name,
                description: profile.description,
                site_description: profile.description,
                city: profile.city,
                address: profile.address,
                address_detail: profile.address_detail,
                logo: profile.avatar_url,
                phone: profile.phone,
                yandex_maps_url: profile.yandex_maps_url,
              }}
              masterTimezone={profile.master_timezone}
            />

            <div className="min-w-0 py-5 md:py-6">
              <div className="max-w-2xl">
              {/* Mobile web: компактный блок контактов/адреса (sidebar скрыт на md-) */}
              {(profile.phone || profile.address || profile.address_detail || profile.city || profile.yandex_maps_url) && (
                <div
                  className="md:hidden mb-3 rounded-xl border border-neutral-200 bg-white p-3"
                  data-testid="public-master-contacts-mobile"
                >
                  <div className="flex flex-col gap-2">
                    {profile.phone && (
                      <a
                        href={`tel:${profile.phone}`}
                        className="text-sm font-semibold text-[#4CAF50] hover:text-[#43a047]"
                      >
                        {profile.phone}
                      </a>
                    )}

                    {(profile.address || profile.city || profile.address_detail) && (
                      <div className="text-sm text-neutral-700">
                        <div className="font-medium text-neutral-900">Адрес</div>
                        {publicAddressLine && (
                          profile.yandex_maps_url ? (
                            <a
                              href={profile.yandex_maps_url}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-1 inline-block underline decoration-dotted underline-offset-2"
                            >
                              {publicAddressLine}
                            </a>
                          ) : (
                            <div className="mt-1">{publicAddressLine}</div>
                          )
                        )}
                        {profile.address_detail && String(profile.address_detail).trim() && (
                          <p className="mt-1.5 text-sm text-neutral-600 whitespace-pre-wrap">
                            {profile.address_detail}
                          </p>
                        )}
                      </div>
                    )}

                    {profile.yandex_maps_url && (
                      <a
                        href={profile.yandex_maps_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-medium bg-[#4CAF50]/10 text-[#2f7d32] hover:bg-[#4CAF50]/15"
                      >
                        Открыть в Яндекс Картах
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Eligibility / loyalty banner */}
              {eligibility && (
                <div className="mb-4 space-y-2">
                  {eligibility.booking_blocked && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800 text-sm">
                      Запись к этому мастеру временно недоступна.
                    </div>
                  )}
                  {eligibility.requires_advance_payment && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-blue-800 text-sm">
                      Для подтверждения записи мастер может запросить предоплату.
                    </div>
                  )}
                  {currentUser && eligibility.points != null && eligibility.points > 0 && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-green-800 text-sm">
                      Доступно баллов: {eligibility.points}
                    </div>
                  )}
                </div>
              )}

              {/* Client note icon (popover) */}
              {currentUser && clientNote && (
                <div className="mb-4 flex items-center gap-2">
                  <span className="text-sm text-gray-500">Ваша заметка:</span>
                  <div className="group relative">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-200 text-gray-600 cursor-help text-xs">
                      ?
                    </span>
                    <div className="absolute left-0 bottom-full mb-1 hidden group-hover:block group-focus-within:block z-10 w-64 p-2 bg-white border rounded shadow-lg text-sm text-gray-700">
                      {clientNote}
                    </div>
                  </div>
                </div>
              )}

              <ErrorBoundary
                key={`public-booking-${slug}`}
                fallbackTestId="public-booking-error"
                message="Ошибка загрузки формы записи."
                fallback={
                  <div data-testid="public-booking-error" className="bg-white rounded-lg shadow-lg p-8">
                    <h1 className="text-2xl font-bold text-gray-900 mb-4">Запись к {profile.master_name}</h1>
                    <p className="text-amber-800">Ошибка загрузки формы. Обновите страницу.</p>
                  </div>
                }
              >
                <PublicBookingWizard
                  slug={slug}
                  profile={profile}
                  currentUser={currentUser}
                  eligibility={eligibility}
                  onAuthRequired={() => openAuthModal('client')}
                  onBookingSuccess={() => {}}
                  onBookingError={() => {}}
                />
              </ErrorBoundary>
              </div>
            </div>
          </div>
        </div>
      </main>

      <div className="hidden md:block">
        <Footer compact />
      </div>
    </div>
  )
}
