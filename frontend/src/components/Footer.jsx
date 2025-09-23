import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="py-8 px-6 bg-[#F5F5F5] border-t border-neutral-200 w-full">
      <div className="container mx-auto">
        {/* Описание системы */}
        <div className="text-center mb-6">
          <h3 className="text-lg font-semibold text-neutral-800 mb-2">DeDato</h3>
          <p className="text-sm text-neutral-600">Система управления записями для индивидуальных мастеров</p>
        </div>

        {/* Навигация */}
        <div className="flex flex-wrap justify-center gap-6 mb-6">
          <Link to="/" className="text-sm text-neutral-600 hover:text-neutral-900 transition-colors">
            Главная
          </Link>
          <Link to="/pricing" className="text-sm text-neutral-600 hover:text-neutral-900 transition-colors">
            Тарифы
          </Link>
          <Link to="/blog" className="text-sm text-neutral-600 hover:text-neutral-900 transition-colors">
            Блог
          </Link>
          <Link to="/about" className="text-sm text-neutral-600 hover:text-neutral-900 transition-colors">
            О нас
          </Link>
          <Link to="/user-agreement" className="text-sm text-neutral-600 hover:text-neutral-900 transition-colors">
            Пользовательское соглашение
          </Link>
        </div>

        {/* Копирайт и контакты */}
        <div className="text-center text-sm text-neutral-500">
          <div>© {new Date().getFullYear()} DeDato. Все права защищены.</div>
          <div className="mt-1">
            <a href="mailto:support@dedato.ru" className="text-blue-600 hover:underline">support@dedato.ru</a>
          </div>
        </div>
      </div>
    </footer>
  )
} 