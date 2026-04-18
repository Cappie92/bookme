import MainLayout from "../layouts/MainLayout"

export default function PublicProfile() {
  // slug будет получен через useParams в будущем
  return (
    <MainLayout>
      <h1 className="text-3xl font-bold">Страница профиля: {'{slug}'}</h1>
    </MainLayout>
  )
} 