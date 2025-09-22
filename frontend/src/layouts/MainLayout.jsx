import Header from "../components/Header"
import Footer from "../components/Footer"

export default function MainLayout({ children, openAuthModal }) {
  return (
    <div className="flex flex-col min-h-screen w-full">
      <Header openAuthModal={openAuthModal} />
      <main className="flex-1 w-full bg-[#F9F7F6]">{children}</main>
      <Footer />
    </div>
  )
} 