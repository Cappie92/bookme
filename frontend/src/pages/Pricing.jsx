import { useState, useEffect } from "react"
import AuthModal from "../modals/AuthModal"
import { isSalonFeaturesEnabled } from "../config/features"

export default function Pricing() {
  // Инициализируем тип клиента в зависимости от настроек салонов
  const [clientType, setClientType] = useState(isSalonFeaturesEnabled() ? "salon" : "individual")
  const [branchCount, setBranchCount] = useState("1")
  const [employeeCount, setEmployeeCount] = useState(5)
  const [monthlyBookings, setMonthlyBookings] = useState("До 100")
  const [showAuthModal, setShowAuthModal] = useState(false)

  const branchOptions = ["1", "2", "3", "4-7", "8+"]
  const bookingOptions = ["До 100", "101-150", "151+"]

  const [monthlyPrice, setMonthlyPrice] = useState(0)
  const [yearlyPrice, setYearlyPrice] = useState(0)
  const [loading, setLoading] = useState(false)

  // Расчет стоимости
  const calculatePrice = () => {
    setLoading(true)
    
    // Небольшая задержка для имитации загрузки
    setTimeout(() => {
      // Используем локальную логику расчета
      let fallbackPrice = 0
      if (isSalonFeaturesEnabled() && clientType === "salon") {
        const branchMultiplier = branchCount === "1" ? 1 : branchCount === "2" ? 1.5 : branchCount === "3" ? 2 : branchCount === "4-7" ? 3 : 4
        const employeeMultiplier = employeeCount / 5
        fallbackPrice = Math.round(5000 * branchMultiplier * employeeMultiplier)
      } else {
        const bookingMultiplier = monthlyBookings === "До 100" ? 1 : monthlyBookings === "101-150" ? 1.3 : 1.6
        fallbackPrice = Math.round(2000 * bookingMultiplier)
      }
      
      setMonthlyPrice(fallbackPrice)
      setYearlyPrice(Math.round(fallbackPrice * 12 * 0.8))
      setLoading(false)
    }, 300)
  }

  // Пересчитываем стоимость при изменении параметров
  useEffect(() => {
    if ((isSalonFeaturesEnabled() && clientType === "salon" && branchCount && employeeCount) || 
        ((clientType === "individual" || !isSalonFeaturesEnabled()) && monthlyBookings)) {
      calculatePrice()
    }
  }, [clientType, branchCount, employeeCount, monthlyBookings])

  const handleRegisterClick = () => {
    setShowAuthModal(true)
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 mt-24">
        <h1 className="text-4xl font-bold text-center mb-8">Калькулятор стоимости</h1>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Левая часть - контролы */}
          <div className="bg-white rounded-lg shadow-lg p-8">
            <h2 className="text-2xl font-semibold mb-6">Настройки</h2>
            
            {/* Выбор типа клиента - показываем только если салоны включены */}
            {isSalonFeaturesEnabled() && (
              <div className="mb-8">
                <h3 className="text-lg font-medium mb-4">Тип клиента</h3>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setClientType("salon")}
                    className={`p-4 border-2 rounded-lg text-center transition-all ${
                      clientType === "salon"
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <div className="font-semibold">Салон красоты</div>
                    <div className="text-sm text-gray-600">Несколько мастеров</div>
                  </button>
                  
                  <button
                    onClick={() => setClientType("individual")}
                    className={`p-4 border-2 rounded-lg text-center transition-all ${
                      clientType === "individual"
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <div className="font-semibold">Индивидуальный мастер</div>
                    <div className="text-sm text-gray-600">Работает самостоятельно</div>
                  </button>
                </div>
              </div>
            )}

            {/* Настройки для салона - показываем только если салоны включены */}
            {isSalonFeaturesEnabled() && clientType === "salon" && (
              <>
                {/* Количество филиалов */}
                <div className="mb-8">
                  <h3 className="text-lg font-medium mb-4">Количество филиалов</h3>
                  <div className="grid grid-cols-5 gap-2">
                    {branchOptions.map((option) => (
                      <button
                        key={option}
                        onClick={() => setBranchCount(option)}
                        className={`p-3 border-2 rounded-lg text-center transition-all ${
                          branchCount === option
                            ? "border-blue-500 bg-blue-50 text-blue-700"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Количество работников */}
                <div className="mb-8">
                  <h3 className="text-lg font-medium mb-4">
                    Количество работников: <span className="text-blue-600 font-semibold">{employeeCount}</span>
                  </h3>
                  <div className="px-2">
                    <input
                      type="range"
                      min="5"
                      max="30"
                      value={employeeCount}
                      onChange={(e) => setEmployeeCount(parseInt(e.target.value))}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                    />
                    <div className="flex justify-between text-sm text-gray-500 mt-2">
                      <span>5</span>
                      <span>30+</span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Настройки для индивидуального мастера */}
            {(clientType === "individual" || !isSalonFeaturesEnabled()) && (
              <div className="mb-8">
                <h3 className="text-lg font-medium mb-4">Количество бронирований в месяц</h3>
                <div className="grid grid-cols-3 gap-3">
                  {bookingOptions.map((option) => (
                    <button
                      key={option}
                      onClick={() => setMonthlyBookings(option)}
                      className={`p-4 border-2 rounded-lg text-center transition-all ${
                        monthlyBookings === option
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div className="font-semibold">{option}</div>
                      <div className="text-sm text-gray-600">бронирований</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Правая часть - результаты */}
          <div className="bg-blue-50 rounded-lg p-8">
            <h2 className="text-2xl font-semibold mb-6">Результат расчета</h2>
            
            {/* Месячная стоимость */}
            <div className="mb-6">
              <h3 className="text-lg font-medium text-gray-700 mb-2">Месячная стоимость</h3>
              {loading ? (
                <div className="text-4xl font-bold text-blue-600 mb-2">
                  <div className="animate-pulse">Расчет...</div>
                </div>
              ) : (
                <div className="text-4xl font-bold text-blue-600 mb-2">
                  {monthlyPrice.toLocaleString()} ₽
                </div>
              )}
              {((isSalonFeaturesEnabled() && clientType === "salon" && (branchCount === "4-7" || branchCount === "8+" || employeeCount > 30)) || 
                (clientType === "individual" || !isSalonFeaturesEnabled())) && (
                <p className="text-gray-600 text-sm">
                  {(isSalonFeaturesEnabled() && clientType === "salon" && (branchCount === "4-7" || branchCount === "8+" || employeeCount > 30)) ? 
                    "Это приблизительная стоимость подписки на основе выбранных параметров. Свяжитесь с нами для получения индивидуальных условий." :
                    "Это приблизительная стоимость подписки на основе выбранных параметров"
                  }
                </p>
              )}
            </div>

            <div className="border-t border-gray-200 pt-6 mb-6">
              <h3 className="text-lg font-medium text-gray-700 mb-2">Годовая стоимость</h3>
              {loading ? (
                <div className="text-2xl font-bold text-gray-800 mb-1">
                  <div className="animate-pulse">Расчет...</div>
                </div>
              ) : (
                <div className="text-2xl font-bold text-gray-800 mb-1">
                  {yearlyPrice.toLocaleString()} ₽
                </div>
              )}
              <p className="text-green-600 text-sm font-medium mb-2">
                Скидка 20% при оплате за год
              </p>
              <p className="text-gray-600 text-sm">
                Общая стоимость за год использования системы
              </p>
            </div>

            {/* Призыв к действию */}
            <div className="text-center">
              <h3 className="text-lg font-semibold mb-2">Готовы начать?</h3>
              <p className="text-gray-600 mb-4">
                Регистрируйтесь сейчас, чтобы воспользоваться предложением
              </p>
              <button 
                onClick={handleRegisterClick}
                className="bg-blue-600 text-white px-8 py-3 rounded-lg text-lg font-semibold hover:bg-blue-700 transition-colors w-full"
              >
                Зарегистрироваться
              </button>
            </div>
          </div>
        </div>

        {/* Модальное окно регистрации */}
        <AuthModal 
          open={showAuthModal} 
          onClose={() => setShowAuthModal(false)}
          defaultRegType={isSalonFeaturesEnabled() && clientType === "salon" ? "salon" : "master"}
        />
      </div>
  )
} 