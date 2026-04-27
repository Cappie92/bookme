import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import Header from '../../components/Header'
import Footer from '../../components/Footer'

const PAGE_BG = 'bg-[#F9F7F6]'

/**
 * Публичная юридическая страница: как у сайта (фон, шапка/подвал), карточка с текстом.
 */
export default function LegalDocumentLayout({ title, documentTitle, children }) {
  const location = useLocation()
  const h1 = documentTitle || title
  const helmetTitle = title || documentTitle || 'Документ'

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  return (
    <div className={`flex flex-col min-h-screen ${PAGE_BG}`}>
      <Helmet>
        <title>{helmetTitle} — DeDato</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <Header />
      <main className="flex-1 w-full pt-[88px] sm:pt-[104px] pb-12 sm:pb-16 px-4 sm:px-6">
        <article className="max-w-3xl mx-auto bg-white rounded-2xl border border-[#E7E2DF] shadow-sm px-4 sm:px-8 md:px-10 py-8 sm:py-10">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-[#1C1917] tracking-tight leading-tight mb-2">
            {h1}
          </h1>
          <div className="prose prose-neutral max-w-none">{children}</div>
        </article>
      </main>
      <Footer compact />
    </div>
  )
}
