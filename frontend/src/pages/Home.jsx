export default function Home() {
  return (
    <div className="pt-[120px] min-h-screen bg-[#F9F7F6]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Добро пожаловать в DeDato
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            Удобная система бронирования для салонов красоты и мастеров
          </p>
          <div className="flex justify-center gap-4">
            <button className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition">
              Начать бронирование
            </button>
            <button className="bg-gray-200 text-gray-700 px-6 py-3 rounded-lg font-semibold hover:bg-gray-300 transition">
              Узнать больше
            </button>
          </div>
        </div>
      </div>
    </div>
  )
} 