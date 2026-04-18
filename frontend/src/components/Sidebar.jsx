export default function Sidebar() {
  return (
    <aside className="w-64 bg-gray-100 p-4 min-h-screen">
      <nav className="flex flex-col gap-4">
        <a href="/admin" className="font-bold hover:text-blue-600">Дашборд</a>
        <a href="/admin/users" className="hover:text-blue-600">Пользователи</a>
        <a href="/admin/blog" className="hover:text-blue-600">Блог</a>
      </nav>
    </aside>
  )
} 