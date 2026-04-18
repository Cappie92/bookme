import { Link, useLocation } from "react-router-dom"
import { 
  HomeIcon, 
  UsersIcon, 
  ShieldCheckIcon,
  DocumentTextIcon,
  ChartBarIcon,
  CogIcon,
  WrenchScrewdriverIcon,
  ClockIcon
} from "@heroicons/react/24/outline"

export default function AdminSidebar() {
  const location = useLocation()

  const menuItems = [
    {
      name: "Дашборд",
      href: "/admin",
      icon: HomeIcon,
    },
    {
      name: "Пользователи",
      href: "/admin/users",
      icon: UsersIcon,
    },
    {
      name: "Модераторы",
      href: "/admin/moderators",
      icon: ShieldCheckIcon,
    },
    {
      name: "Блог",
      href: "/admin/blog",
      icon: DocumentTextIcon,
    },
    {
      name: "Статистика",
      href: "/admin/stats",
      icon: ChartBarIcon,
    },
    {
      name: "Функции",
      href: "/admin/functions",
      icon: WrenchScrewdriverIcon,
    },
    {
      name: "Логи всегда бесплатно",
      href: "/admin/always-free-logs",
      icon: ClockIcon,
    },
    {
      name: "Настройки",
      href: "/admin/settings",
      icon: CogIcon,
    }
  ]

  return (
    <div className="w-64 bg-gray-900 text-white flex flex-col fixed left-0 top-0 h-full pt-[140px]">
      {/* Логотип */}
      <div className="p-6 border-b border-gray-800">
        <h1 className="text-xl font-bold text-white">Appointo Admin</h1>
        <p className="text-sm text-gray-400">Панель администратора</p>
      </div>

      {/* Навигация */}
      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {menuItems.map((item) => {
            const isActive = location.pathname === item.href
            return (
              <li key={item.name}>
                <Link
                  to={item.href}
                  className={`flex items-center px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? "bg-blue-600 text-white"
                      : "text-gray-300 hover:bg-gray-800 hover:text-white"
                  }`}
                >
                  <item.icon className="w-5 h-5 mr-3" />
                  {item.name}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Информация о пользователе */}
      <div className="p-4 border-t border-gray-800">
        <div className="flex items-center">
          <div className="w-8 h-8 bg-[#4CAF50] rounded-full flex items-center justify-center">
            <span className="text-sm font-medium text-white">A</span>
          </div>
          <div className="ml-3">
            <p className="text-sm font-medium text-white">Администратор</p>
            <p className="text-xs text-gray-400">admin@appointo.com</p>
          </div>
        </div>
      </div>
    </div>
  )
} 