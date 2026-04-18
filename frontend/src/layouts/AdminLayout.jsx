import AdminSidebar from "../components/AdminSidebar"
import Header from "../components/Header"

export default function AdminLayout({ children, openAuthModal }) {
  return (
    <div className="min-h-screen bg-[#F9F7F6]">
      <Header openAuthModal={openAuthModal} />
      <div className="flex">
        <AdminSidebar />
        <main className="flex-1 ml-64 pt-[140px] p-8 bg-[#F9F7F6]">{children}</main>
      </div>
    </div>
  )
} 