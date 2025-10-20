import { BrowserRouter, Routes, Route } from "react-router-dom"
import { HelmetProvider } from 'react-helmet-async'
import { lazy, Suspense } from 'react'
import { AuthProvider } from './contexts/AuthContext'
import MainLayout from "./layouts/MainLayout"
import AdminLayout from "./layouts/AdminLayout"
import ClientLayout from "./layouts/ClientLayout"

// Критичные компоненты для первого рендера (загружаются сразу)
import Home from "./pages/Home"
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
const PublicProfile = lazy(() => import("./pages/PublicProfile"))
const SubdomainPage = lazy(() => import("./pages/SubdomainPage"))
const BranchBookingPage = lazy(() => import("./pages/BranchBookingPage"))
const DesignSystemDemo = lazy(() => import("./pages/DesignSystemDemo"))

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

// Admin pages
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"))
const AdminUsers = lazy(() => import("./pages/AdminUsers"))
const AdminBlog = lazy(() => import("./pages/AdminBlog"))
const AdminStats = lazy(() => import("./pages/AdminStats"))
const AdminSettings = lazy(() => import("./pages/AdminSettings"))
const AdminModerators = lazy(() => import("./pages/AdminModerators"))
const AdminFunctions = lazy(() => import("./pages/AdminFunctions"))
const AdminAlwaysFreeLogs = lazy(() => import("./pages/AdminAlwaysFreeLogs"))

// Test pages
const AuthTest = lazy(() => import("./pages/AuthTest"))
const BookingForm = lazy(() => import("./pages/test/BookingForm"))
const DomainTest = lazy(() => import("./pages/test/DomainTest"))
const SimpleDomainTest = lazy(() => import("./pages/test/SimpleDomainTest"))
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

function App() {

  return (
    <HelmetProvider>
      <BrowserRouter>
            <AuthProvider>
              <AuthModal />
              <MasterModal />
              <ScheduleModal />
              <BookingModal />
        <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Роуты для поддоменов */}
          <Route path="/domain/:subdomain" element={<SubdomainPage />} />
          
          {/* Основные роуты */}
          <Route path="/" element={<MainLayout><Home/></MainLayout>} />
          <Route path="/pricing" element={<MainLayout><Pricing/></MainLayout>} />
          <Route path="/about" element={<MainLayout><About/></MainLayout>} />
          <Route path="/blog" element={<MainLayout><BlogList/></MainLayout>} />
          <Route path="/blog/:slug" element={<MainLayout><BlogPost/></MainLayout>} />
          <Route path="/dashboard" element={<MainLayout><ClientDashboard/></MainLayout>} />
          <Route path="/dashboard/service" element={<MainLayout><ServiceDashboard/></MainLayout>} />
          <Route path="/dashboard/branches" element={<MainLayout><BranchesDashboard/></MainLayout>} />
          <Route path="/dashboard/places" element={<MainLayout><PlacesDashboard/></MainLayout>} />
          <Route path="/profile/:slug" element={<MainLayout><PublicProfile/></MainLayout>} />
          <Route path="/admin" element={<AdminLayout><AdminDashboard/></AdminLayout>} />
          <Route path="/admin/users" element={<AdminLayout><AdminUsers/></AdminLayout>} />
          <Route path="/admin/moderators" element={<AdminLayout><AdminModerators/></AdminLayout>} />
          <Route path="/admin/blog" element={<AdminLayout><AdminBlog/></AdminLayout>} />
          <Route path="/admin/stats" element={<AdminLayout><AdminStats/></AdminLayout>} />
          <Route path="/admin/functions" element={<AdminLayout><AdminFunctions/></AdminLayout>} />
          <Route path="/admin/always-free-logs" element={<AdminLayout><AdminAlwaysFreeLogs/></AdminLayout>} />
          <Route path="/admin/settings" element={<AdminLayout><AdminSettings/></AdminLayout>} />
          <Route path="/user-agreement" element={<UserAgreement/>} />
          <Route path="/client" element={<ClientLayout><ClientDashboard/></ClientLayout>} />
          <Route path="/client/" element={<ClientLayout><ClientDashboard/></ClientLayout>} />
          <Route path="/client/dashboard" element={<ClientLayout><ClientDashboard/></ClientLayout>} />
          <Route path="/client/profile" element={<ClientLayout><ClientProfile/></ClientLayout>} />
          <Route path="/client/favorite" element={<ClientLayout><ClientFavorite/></ClientLayout>} />
          <Route path="/client/master-notes" element={<ClientLayout><ClientMasterNotes/></ClientLayout>} />
          <Route path="/master" element={<MasterDashboard/>} />
          <Route path="/salon" element={<ServiceDashboard/>} />
          <Route path="/test/booking" element={<MainLayout><BookingForm/></MainLayout>} />
          <Route path="/test/auth" element={<MainLayout><AuthTest/></MainLayout>} />
          <Route path="/test/domain" element={<MainLayout><DomainTest/></MainLayout>} />
          <Route path="/test/simple-domain" element={<MainLayout><SimpleDomainTest/></MainLayout>} />
          <Route path="/test/working-hours" element={<MainLayout><WorkingHoursTest/></MainLayout>} />
          <Route path="/test/schedule" element={<MainLayout><ScheduleTest/></MainLayout>} />
          <Route path="/test/yandex-geocoder" element={<MainLayout><YandexGeocoderTest/></MainLayout>} />
          <Route path="/design-system" element={<MainLayout><DesignSystemDemo/></MainLayout>} />
          <Route path="/booking/:salonId/:branchId" element={<BranchBookingPage />} />
          <Route path="/test/any-master" element={<MainLayout><TestAnyMaster/></MainLayout>} />
          
          {/* Catch-all роут для несуществующих путей */}
          <Route path="*" element={<MainLayout><Home/></MainLayout>} />
        </Routes>
        </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </HelmetProvider>
  )
}

export default App
