import Header from "../components/Header"
import Footer from "../components/Footer"

export default function MainLayout({ children }) {
  return (
    <div className="flex flex-col min-h-screen w-full overflow-x-hidden">
      <Header />
      <main className="flex-1 w-full bg-white overflow-x-hidden">{children}</main>
      <Footer />
    </div>
  )
} 