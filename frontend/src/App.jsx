import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom"
import { HelmetProvider } from 'react-helmet-async'
import { lazy, Suspense, useEffect, useRef } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import MetrikaRouteListener from './analytics/MetrikaRouteListener'
import { FavoritesProvider } from './contexts/FavoritesContext'
import { ToastProvider } from './contexts/ToastContext'
import MainLayout from "./layouts/MainLayout"
import AdminLayout from "./layouts/AdminLayout"
import ClientLayout from "./layouts/ClientLayout"

// Критичные компоненты для первого рендера (загружаются сразу)
import Home from "./pages/Home"
import NotFound from "./pages/NotFound"
import AuthModal from "./modals/AuthModal"
import MasterModal from "./modals/MasterModal"
import ScheduleModal from "./modals/ScheduleModal"
import BookingModal from "./modals/BookingModal"

// Lazy-loaded компоненты (загружаются по требованию)
const Pricing = lazy(() => import("./pages/Pricing"))
const About = lazy(() => import("./pages/About"))
const BlogList = lazy(() => import("./pages/BlogList"))
const BlogPost = lazy(() => import("./pages/BlogPost"))
const UserAgreement = lazy(() => import("./pages/UserAgreement"))
const PersonalDataConsentPage = lazy(() => import("./pages/PersonalDataConsentPage"))
const MarketingConsent = lazy(() => import("./pages/MarketingConsent"))
const PublicProfile = lazy(() => import("./pages/PublicProfile"))
// SubdomainPage снят: legacy /domain/:subdomain удалён (см. AUDIT_AND_HANDOFF.md).
// Все клиентские переходы идут на современную /m/:slug (MasterPublicBookingPage).
const MasterPublicBookingPage = lazy(() => import("./pages/MasterPublicBookingPage"))
const PaymentSuccess = lazy(() => import("./pages/PaymentSuccess"))
const PaymentFailed = lazy(() => import("./pages/PaymentFailed"))
const BranchBookingPage = lazy(() => import("./pages/BranchBookingPage"))
const DesignSystemDemo = lazy(() => import("./pages/DesignSystemDemo"))
const Clients = lazy(() => import("./pages/Clients"))
const VerifyEmail = lazy(() => import("./pages/VerifyEmail"))
const OAuthCallback = lazy(() => import("./pages/OAuthCallback"))

// Client pages
const ClientDashboard = lazy(() => import("./pages/ClientDashboard"))
const ClientProfile = lazy(() => import("./pages/ClientProfile"))
const ClientFavorite = lazy(() => import("./pages/ClientFavorite"))
const ClientMasterNotes = lazy(() => import("./pages/ClientMasterNotes"))

// Service dashboards
const ServiceDashboard = lazy(() => import("./pages/ServiceDashboard"))
const PlacesDashboard = lazy(() => import("./pages/PlacesDashboard"))
const BranchesDashboard = lazy(() => import("./pages/BranchesDashboard"))
const MasterDashboard = lazy(() => import("./pages/MasterDashboard"))
const DemoMasterEntry = lazy(() => import("./pages/DemoMasterEntry"))
const MasterSubscriptionPlans = lazy(() => import("./pages/MasterSubscriptionPlans"))
const MasterTariff = lazy(() => import("./pages/MasterTariff"))

// Admin pages
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"))
const AdminUsers = lazy(() => import("./pages/AdminUsers"))
const AdminBlog = lazy(() => import("./pages/AdminBlog"))
const AdminStats = lazy(() => import("./pages/AdminStats"))
const AdminSettings = lazy(() => import("./pages/AdminSettings"))
const AdminModerators = lazy(() => import("./pages/AdminModerators"))
const AdminFunctions = lazy(() => import("./pages/AdminFunctions"))
const AdminAlwaysFreeLogs = lazy(() => import("./pages/AdminAlwaysFreeLogs"))
const AdminPromoEngine = lazy(() => import("./pages/AdminPromoEngine"))

// Test pages
const AuthTest = lazy(() => import("./pages/AuthTest"))
const BookingForm = lazy(() => import("./pages/test/BookingForm"))
// DomainTest / SimpleDomainTest сняты вместе с /domain/:subdomain.
const WorkingHoursTest = lazy(() => import("./pages/test/WorkingHoursTest"))
const ScheduleTest = lazy(() => import("./pages/test/ScheduleTest"))
const YandexGeocoderTest = lazy(() => import("./pages/test/YandexGeocoderTest"))
const TestAnyMaster = lazy(() => import("./pages/TestAnyMaster"))

// Loading компонент для Suspense
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="text-center">
      <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-[#4CAF50]"></div>
      <p className="mt-4 text-gray-600">Загрузка...</p>
    </div>
  </div>
)

function ScrollToTopOnRouteChange() {
  const location = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])
  return null
}

function RegisterQueryHandler() {
  const location = useLocation()
  const { openAuthModal } = useAuth()
  const handledKeyRef = useRef('')
  useEffect(() => {
    if (location.pathname !== '/register') return
    const key = `${location.pathname}${location.search}`
    if (handledKeyRef.current === key) return
    handledKeyRef.current = key
    const query = new URLSearchParams(location.search)
    const promoCode = (query.get('promo_code') || query.get('ref') || '').trim()
    openAuthModal('master', 'register', {
      initialForm: promoCode ? { promo_code: promoCode } : null,
      redirectMode: 'default',
    })
  }, [location.pathname, location.search, openAuthModal])
  return null
}

function getPostAdminDenyPath(role) {
  const normalized = (role || '').toString().toLowerCase()
  if (normalized === 'master' || normalized === 'indie') return '/master'
  if (normalized === 'salon') return '/salon'
  return '/'
}

function AdminRoute({ children }) {
  const { loading, user, isAuthenticated, openAuthModal } = useAuth()
  const role = (user?.role || '').toString().toLowerCase()

  useEffect(() => {
    if (!loading && (!isAuthenticated || !user)) {
      openAuthModal('client', 'login', { redirectMode: 'default' })
    }
  }, [loading, isAuthenticated, user, openAuthModal])

  if (loading) {
    return <PageLoader />
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/" replace />
  }

  if (role !== 'admin') {
    return <Navigate to={getPostAdminDenyPath(role)} replace />
  }

  return <AdminLayout>{children}</AdminLayout>
}

function App() {

  return (
    <HelmetProvider>
      <BrowserRouter>
            <MetrikaRouteListener />
            <ScrollToTopOnRouteChange />
            <AuthProvider>
              <ToastProvider>
              <FavoritesProvider>
                <RegisterQueryHandler />
                <AuthModal />
                <MasterModal />
                <ScheduleModal />
                <BookingModal />
        <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Публичная страница записи к мастеру: /m/:slug.
              Старый /domain/:subdomain удалён — все клиентские переходы строятся как /m/{master.domain}. */}
          <Route path="/m/:slug" element={<MasterPublicBookingPage />} />

          {/* Основные роуты */}
          <Route path="/" element={<MainLayout><Home/></MainLayout>} />
          <Route path="/pricing" element={<MainLayout><Pricing/></MainLayout>} />
          <Route path="/about" element={<MainLayout><About/></MainLayout>} />
          <Route path="/register" element={<MainLayout><Home/></MainLayout>} />
          <Route path="/verify-email" element={<MainLayout><VerifyEmail/></MainLayout>} />
          <Route path="/auth/oauth/callback" element={<OAuthCallback/>} />
          <Route path="/blog" element={<MainLayout><BlogList/></MainLayout>} />
          <Route path="/blog/:slug" element={<MainLayout><BlogPost/></MainLayout>} />
          <Route path="/dashboard" element={<MainLayout><ClientDashboard/></MainLayout>} />
          <Route path="/dashboard/service" element={<MainLayout><ServiceDashboard/></MainLayout>} />
          <Route path="/dashboard/branches" element={<MainLayout><BranchesDashboard/></MainLayout>} />
          <Route path="/dashboard/places" element={<MainLayout><PlacesDashboard/></MainLayout>} />
          <Route path="/profile/:slug" element={<MainLayout><PublicProfile/></MainLayout>} />
          <Route path="/clients" element={<MainLayout><Clients/></MainLayout>} />
          <Route path="/admin" element={<AdminRoute><AdminDashboard/></AdminRoute>} />
          <Route path="/admin/users" element={<AdminRoute><AdminUsers/></AdminRoute>} />
          <Route path="/admin/moderators" element={<AdminRoute><AdminModerators/></AdminRoute>} />
          <Route path="/admin/blog" element={<AdminRoute><AdminBlog/></AdminRoute>} />
          <Route path="/admin/stats" element={<AdminRoute><AdminStats/></AdminRoute>} />
          <Route path="/admin/functions" element={<AdminRoute><AdminFunctions/></AdminRoute>} />
          <Route path="/admin/promo-engine" element={<AdminRoute><AdminPromoEngine/></AdminRoute>} />
          <Route path="/admin/always-free-logs" element={<AdminRoute><AdminAlwaysFreeLogs/></AdminRoute>} />
          <Route path="/admin/settings" element={<AdminRoute><AdminSettings/></AdminRoute>} />
          <Route path="/user-agreement" element={<UserAgreement/>} />
          <Route path="/personal-data-consent" element={<PersonalDataConsentPage />} />
          <Route path="/marketing-consent" element={<MarketingConsent />} />
          <Route path="/payment/success" element={<PaymentSuccess/>} />
          <Route path="/payment/failed" element={<PaymentFailed/>} />
          <Route path="/client" element={<ClientLayout><ClientDashboard/></ClientLayout>} />
          <Route path="/client/" element={<ClientLayout><ClientDashboard/></ClientLayout>} />
          <Route path="/client/dashboard" element={<ClientLayout><ClientDashboard/></ClientLayout>} />
          <Route path="/client/profile" element={<ClientLayout><ClientProfile/></ClientLayout>} />
          <Route path="/client/favorite" element={<ClientLayout><ClientFavorite/></ClientLayout>} />
          <Route path="/client/master-notes" element={<ClientLayout><ClientMasterNotes/></ClientLayout>} />
          <Route path="/master" element={<MasterDashboard/>} />
          <Route path="/demo/master" element={<MainLayout><DemoMasterEntry/></MainLayout>} />
          <Route path="/master/tariff" element={<Navigate to="/master?tab=tariff" replace />} />
          <Route path="/master/subscription/plans" element={<MasterSubscriptionPlans/>} />
          <Route path="/salon" element={<ServiceDashboard/>} />
          <Route path="/test/booking" element={<MainLayout><BookingForm/></MainLayout>} />
          <Route path="/test/auth" element={<MainLayout><AuthTest/></MainLayout>} />
          <Route path="/test/working-hours" element={<MainLayout><WorkingHoursTest/></MainLayout>} />
          <Route path="/test/schedule" element={<MainLayout><ScheduleTest/></MainLayout>} />
          <Route path="/test/yandex-geocoder" element={<MainLayout><YandexGeocoderTest/></MainLayout>} />
          <Route path="/design-system" element={<MainLayout><DesignSystemDemo/></MainLayout>} />
          <Route path="/booking/:salonId/:branchId" element={<BranchBookingPage />} />
          <Route path="/test/any-master" element={<MainLayout><TestAnyMaster/></MainLayout>} />
          
          {/* Страница 404 */}
          <Route path="/404" element={<MainLayout><NotFound/></MainLayout>} />
          
          {/* Catch-all роут для несуществующих путей - перенаправление на /404 */}
          <Route path="*" element={<Navigate to="/404" replace />} />
        </Routes>
        </Suspense>
              </FavoritesProvider>
              </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </HelmetProvider>
  )
}

export default App
