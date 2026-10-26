import { Link, useLocation } from "react-router-dom"
import { 
  HomeIcon, 
  UsersIcon, 
  ShieldCheckIcon,
  DocumentTextIcon,
  ChartBarIcon,
  CogIcon,
  WrenchScrewdriverIcon,
  ClockIcon,
  TagIcon
} from "@heroicons/react/24/outline"
import { useAuth } from "../contexts/AuthContext"
import { useAdminAccess } from "../contexts/AdminAccessContext"
import { ADMIN_ACCESS_STATUS, ADMIN_ROLE_LABELS, accessibleSections, normalizeRole } from "../utils/adminAccess"

const SECTION_ICONS = {
  dashboard: HomeIcon,
  users: UsersIcon,
  moderators: ShieldCheckIcon,
  blog: DocumentTextIcon,
  stats: ChartBarIcon,
  functions: WrenchScrewdriverIcon,
  "promo-engine": TagIcon,
  "always-free-logs": ClockIcon,
  settings: CogIcon,
}

export default function AdminSidebar() {
  const location = useLocation()
  const { user } = useAuth()
  const access = useAdminAccess()
  const menuItems = access.status === ADMIN_ACCESS_STATUS.READY ? accessibleSections(access.access) : []
  const role = normalizeRole(access.access?.role || user?.role)
  const roleLabel = ADMIN_ROLE_LABELS[role] || "Сотрудник"
  const displayName = user?.full_name || roleLabel
  const contact = user?.email || user?.phone || ""

  return (
    <div className="w-full md:w-64 bg-gray-900 text-white flex flex-col md:fixed md:left-0 md:top-0 md:h-full pt-[96px] md:pt-[140px]" data-testid="admin-sidebar">
      {/* Логотип */}
      <div className="px-6 py-4 md:p-6 border-b border-gray-800">
        <h1 className="text-xl font-bold text-white">DeDato Admin</h1>
        <p className="text-sm text-gray-400">Административная панель</p>
      </div>

      {/* Навигация */}
      <nav className="md:flex-1 p-2 md:p-4 overflow-x-auto md:overflow-x-visible md:overflow-y-auto" aria-label="Разделы административной панели">
        <ul className="flex gap-2 md:block md:space-y-2">
          {menuItems.map((item) => {
            const isActive = location.pathname === item.path
            const Icon = SECTION_ICONS[item.key]
            return (
              <li key={item.key}>
                <Link
                  to={item.path}
                  data-testid={`admin-nav-${item.key}`}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex items-center whitespace-nowrap md:whitespace-normal px-3 py-2 md:px-4 md:py-3 rounded-lg transition-colors ${
                    isActive
                      ? "bg-blue-600 text-white"
                      : "text-gray-300 hover:bg-gray-800 hover:text-white"
                  }`}
                >
                  {Icon ? <Icon className="w-5 h-5 mr-3" /> : null}
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Информация о пользователе */}
      <div className="hidden md:block p-4 border-t border-gray-800">
        <div className="flex items-center">
          <div className="w-8 h-8 bg-[#4CAF50] rounded-full flex items-center justify-center">
            <span className="text-sm font-medium text-white">{displayName.charAt(0).toUpperCase()}</span>
          </div>
          <div className="ml-3 min-w-0">
            <p className="text-sm font-medium text-white truncate" data-testid="admin-identity-name">{displayName}</p>
            <p className="text-xs text-gray-400 truncate" data-testid="admin-identity-role">
              {roleLabel}{contact ? ` · ${contact}` : ""}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
