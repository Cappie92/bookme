export default function Footer() {
  return (
    <footer className="py-4 px-6 bg-[#F5F5F5] text-center border-t border-neutral-200 w-full">
      <div>© {new Date().getFullYear()} Appointo. Все права защищены.</div>
      <div className="mt-2">
        <a href="mailto:support@appointo.ru" className="text-blue-600 hover:underline">support@appointo.ru</a>
      </div>
    </footer>
  )
} 