import AdminSidebar from "../components/AdminSidebar"
import Header from "../components/Header"

export default function AdminLayout({ children, openAuthModal }) {
  return (
    <div className="min-h-screen bg-[#F9F7F6]">
      <Header openAuthModal={openAuthModal} />
      <div className="flex flex-col md:flex-row min-w-0">
        <AdminSidebar />
        <main className="flex-1 min-w-0 md:ml-64 p-4 pt-6 md:p-8 md:pt-[140px] bg-[#F9F7F6]">{children}</main>
      </div>
    </div>
  )
}
