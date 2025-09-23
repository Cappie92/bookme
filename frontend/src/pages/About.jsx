import MainLayout from "../layouts/MainLayout"

export default function About({ openAuthModal }) {
  return (
    <MainLayout openAuthModal={openAuthModal}>
      <h1 className="text-3xl font-bold">О сервисе</h1>
    </MainLayout>
  )
} 