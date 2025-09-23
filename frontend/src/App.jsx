import { BrowserRouter, Routes, Route } from "react-router-dom"
import { HelmetProvider } from 'react-helmet-async'
import { useState, useEffect } from 'react'
import { AuthProvider } from './contexts/AuthContext'
import MainLayout from "./layouts/MainLayout"
import AdminLayout from "./layouts/AdminLayout"
import Home from "./pages/Home"
import Pricing from "./pages/Pricing"
import About from "./pages/About"
import BlogList from "./pages/BlogList"
import BlogPost from "./pages/BlogPost"
import ClientDashboard from "./pages/ClientDashboard"
import ClientProfile from "./pages/ClientProfile"
import AuthTest from "./pages/AuthTest"
import ServiceDashboard from "./pages/ServiceDashboard"
import PlacesDashboard from "./pages/PlacesDashboard"
import BranchesDashboard from "./pages/BranchesDashboard"
import PublicProfile from "./pages/PublicProfile"
import AdminDashboard from "./pages/AdminDashboard"
import AdminUsers from "./pages/AdminUsers"
import AdminBlog from "./pages/AdminBlog"
import AdminStats from "./pages/AdminStats"
import AdminSettings from "./pages/AdminSettings"
import AdminModerators from "./pages/AdminModerators"
import AdminFunctions from "./pages/AdminFunctions"
import AdminAlwaysFreeLogs from "./pages/AdminAlwaysFreeLogs"
import AuthModal from "./modals/AuthModal"
import MasterModal from "./modals/MasterModal"
import ScheduleModal from "./modals/ScheduleModal"
import BookingModal from "./modals/BookingModal"
import UserAgreement from "./pages/UserAgreement"
import MasterDashboard from "./pages/MasterDashboard"
import BookingForm from "./pages/test/BookingForm"
import SubdomainPage from "./pages/SubdomainPage"
import DomainTest from "./pages/test/DomainTest"
import SimpleDomainTest from "./pages/test/SimpleDomainTest"
import WorkingHoursTest from "./pages/test/WorkingHoursTest"
import ScheduleTest from "./pages/test/ScheduleTest"
import YandexGeocoderTest from "./pages/test/YandexGeocoderTest"
import DesignSystemDemo from "./pages/DesignSystemDemo"
import BranchBookingPage from "./pages/BranchBookingPage"
import ClientMasterNotes from "./pages/ClientMasterNotes"
import ClientFavorite from "./pages/ClientFavorite"
import TestAnyMaster from "./pages/TestAnyMaster"
import ClientLayout from "./layouts/ClientLayout"

function App() {

  return (
    <HelmetProvider>
      <BrowserRouter>
            <AuthProvider>
              <AuthModal />
              <MasterModal />
              <ScheduleModal />
              <BookingModal />
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
        </AuthProvider>
      </BrowserRouter>
    </HelmetProvider>
  )
}

export default App
