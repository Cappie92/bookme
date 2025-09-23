import React from 'react'
import { 
  Button, 
  Card, 
  Input, 
  Badge, 
  Alert, 
  Checkbox, 
  Radio, 
  ProfileCard, 
  ServiceCard, 
  StatusIndicator, 
  Tabs,
  Logo,
  Calendar
} from '../components/ui'

export default function DesignSystemDemo() {
  const [inputValue, setInputValue] = React.useState('')
  const [inputError, setInputError] = React.useState(false)
  const [checkbox1, setCheckbox1] = React.useState(true)
  const [checkbox2, setCheckbox2] = React.useState(false)
  const [radioValue, setRadioValue] = React.useState('option1')
  const [activeTab, setActiveTab] = React.useState('services')
  const [dropdownValue, setDropdownValue] = React.useState('dedato')
  const [showDropdown, setShowDropdown] = React.useState(false)
  const [selectedDate, setSelectedDate] = React.useState(null)
  const [showCalendar, setShowCalendar] = React.useState(false)
  const [availableDates] = React.useState([
    new Date(2025, 0, 15), // 15 января
    new Date(2025, 0, 16), // 16 января
    new Date(2025, 0, 17), // 17 января
    new Date(2025, 0, 20), // 20 января
    new Date(2025, 0, 21), // 21 января
    new Date(2025, 0, 22), // 22 января
    new Date(2025, 0, 23), // 23 января
    new Date(2025, 0, 24), // 24 января
    new Date(2025, 0, 27), // 27 января
    new Date(2025, 0, 28), // 28 января
    new Date(2025, 0, 29), // 29 января
    new Date(2025, 0, 30), // 30 января
    new Date(2025, 0, 31), // 31 января
  ])

  // Закрытие выпадающих меню при клике вне их области
  React.useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('.dropdown-container')) {
        setShowDropdown(false)
      }
      if (!event.target.closest('.calendar-container')) {
        setShowCalendar(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const tabs = [
    { label: 'Home / Services', value: 'services' },
    { label: '1', value: 'tab1' },
    { label: '2', value: 'tab2' },
    { label: '>', value: 'next' }
  ]

  return (
    <div className="min-h-screen bg-[#F9F7F6] pt-[180px]"> {/* Обновили отступ с pt-[140px] до pt-[180px] */}
      <div className="container">
        <div className="section">
          {/* Логотип в заголовке */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <Logo size="xl" />
            </div>
            <h1 className="text-4xl font-bold mb-4 text-[#4CAF50]">
              Дизайн-система Dedato
            </h1>
            <p className="text-lg text-neutral-600 max-w-3xl mx-auto">
              Обновленная система компонентов для салона красоты
            </p>
          </div>

          {/* Логотип */}
          <section className="mb-16">
            <h2 className="text-3xl font-semibold mb-8">Логотип</h2>
            
            <Card>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <Logo size="xl" />
                  <div>
                    <h3 className="text-xl font-semibold">Логотип Dedato</h3>
                    <p className="text-sm text-neutral-600">Основной логотип бренда</p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    const link = document.createElement('a');
                    link.href = '/dedato_wht.jpg';
                    link.download = 'dedato-logo.jpg';
                    link.click();
                  }}
                  className="px-4 py-2 bg-[#4CAF50] text-white rounded-lg hover:bg-[#45A049] transition-colors"
                >
                  Скачать
                </button>
              </div>
            </Card>
          </section>

          {/* Кнопки */}
          <section className="mb-16">
            <h2 className="text-3xl font-semibold mb-8">Кнопки</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card>
                <h3 className="text-xl font-semibold mb-4">Варианты кнопок</h3>
                <div className="space-y-3">
                  <Button variant="primary">Основная кнопка</Button>
                  <Button variant="secondary">Вторичная кнопка</Button>
                  <Button variant="disabled" disabled>Отключенная кнопка</Button>
                  <Button variant="hover">При наведении</Button>
                </div>
              </Card>

              <Card>
                <h3 className="text-xl font-semibold mb-4">Размеры</h3>
                <div className="space-y-3">
                  <Button variant="primary" size="sm">Маленькая</Button>
                  <Button variant="primary" size="md">Средняя</Button>
                  <Button variant="primary" size="lg">Большая</Button>
                </div>
              </Card>
            </div>
          </section>

          {/* Формы */}
          <section className="mb-16">
            <h2 className="text-3xl font-semibold mb-8">Формы</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <Card>
                <h3 className="text-xl font-semibold mb-4">Текстовое поле</h3>
                <Input
                  label="Текстовое поле"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Заполнитель"
                />
              </Card>

              <Card>
                <h3 className="text-xl font-semibold mb-4">Выпадающий список</h3>
                <div className="relative dropdown-container">
                  <Input
                    label="Dropdown"
                    value={dropdownValue}
                    readOnly
                    onClick={() => setShowDropdown(!showDropdown)}
                  />
                  <button 
                    className="absolute right-3 top-1/2 transform -translate-y-1/2"
                    onClick={() => setShowDropdown(!showDropdown)}
                  >
                    <svg className="w-4 h-4 text-neutral-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                  
                  {showDropdown && (
                    <div className="absolute top-full left-0 right-0 bg-white border border-neutral-200 rounded-lg shadow-lg z-10 mt-1">
                      <div 
                        className="px-4 py-2 hover:bg-neutral-100 cursor-pointer"
                        onClick={() => {
                          setDropdownValue('dedato')
                          setShowDropdown(false)
                        }}
                      >
                        dedato
                      </div>
                      <div 
                        className="px-4 py-2 hover:bg-neutral-100 cursor-pointer"
                        onClick={() => {
                          setDropdownValue('appointo')
                          setShowDropdown(false)
                        }}
                      >
                        appointo
                      </div>
                      <div 
                        className="px-4 py-2 hover:bg-neutral-100 cursor-pointer"
                        onClick={() => {
                          setDropdownValue('bookme')
                          setShowDropdown(false)
                        }}
                      >
                        bookme
                      </div>
                    </div>
                  )}
                </div>
              </Card>

              <Card>
                <h3 className="text-xl font-semibold mb-4">Флажок</h3>
                <div className="space-y-2">
                  <Checkbox
                    checked={checkbox1}
                    onChange={(e) => setCheckbox1(e.target.checked)}
                    label="Да"
                  />
                  <Checkbox
                    checked={checkbox2}
                    onChange={(e) => setCheckbox2(e.target.checked)}
                  />
                </div>
              </Card>

              <Card>
                <h3 className="text-xl font-semibold mb-4">Переключатель</h3>
                <Radio
                  name="radio-group"
                  value="option1"
                  checked={radioValue === 'option1'}
                  onChange={(e) => setRadioValue(e.target.value)}
                  label="Выбрать"
                />
              </Card>
            </div>
          </section>

          {/* Calendar */}
          <section className="mb-16">
            <h2 className="text-3xl font-semibold mb-8">Календарь</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <h3 className="text-xl font-semibold mb-4">Выбор даты</h3>
                <div className="relative calendar-container">
                  <Input
                    value={selectedDate ? selectedDate.toLocaleDateString('ru-RU') : ''}
                    placeholder="Выберите дату"
                    readOnly
                    onClick={() => setShowCalendar(!showCalendar)}
                  />
                  
                  {showCalendar && (
                    <div className="absolute top-full left-0 right-0 z-10 mt-1">
                      <Calendar
                        selectedDate={selectedDate}
                        onDateSelect={(date) => {
                          setSelectedDate(date)
                          setShowCalendar(false)
                        }}
                        availableDates={availableDates}
                      />
                    </div>
                  )}
                </div>
              </Card>

              <Card>
                <h3 className="text-xl font-semibold mb-4">С галочкой</h3>
                <div className="relative">
                  <Input
                    value="recifers"
                    readOnly
                  />
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                    <svg className="w-5 h-5 text-primary-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
              </Card>
            </div>

            <div className="mt-6">
              <StatusIndicator
                type="error"
                message="Сообщение об ошибке"
                optional="необязательно"
                onClose={() => console.log('close')}
              />
            </div>
          </section>

          {/* Навигация */}
          <section className="mb-16">
            <h2 className="text-3xl font-semibold mb-8">Навигация</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <h3 className="text-xl font-semibold mb-4">Услуги / Записи</h3>
                <div className="flex space-x-2">
                  <Button variant="secondary">Услуги</Button>
                  <Button variant="secondary" className="flex items-center space-x-2">
                    <span>Записи</span>
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                  </Button>
                </div>
              </Card>

              <Card>
                <h3 className="text-xl font-semibold mb-4">Хлебные крошки</h3>
                <p className="text-sm text-neutral-700">Главная / Услуги</p>
              </Card>
            </div>
          </section>

          {/* Карточки */}
          <section className="mb-16">
            <h2 className="text-3xl font-semibold mb-8">Карточки</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <ProfileCard
                name="Julia Parker"
                specialty="specialistst"
                rating={4.9}
                reviews={75}
              />

              <ServiceCard
                title="Haircut"
                duration="45 min"
                price={50}
                icon={
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
              />

              <Card>
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <div className="w-6 h-6 bg-[#E8F5E8] rounded flex items-center justify-center">
                      <svg className="w-4 h-4 text-[#4CAF50]" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <span className="text-sm font-medium text-neutral-900">Юлия</span>
                    <span className="text-xs text-neutral-600">Стилист</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-6 h-6 bg-[#E8F5E8] rounded flex items-center justify-center">
                      <svg className="w-4 h-4 text-[#4CAF50]" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <span className="text-sm text-neutral-600">45 мин</span>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-semibold text-neutral-900">5000 ₽</span>
                  </div>
                </div>
              </Card>

              <Card>
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-neutral-900">Запись</h3>
                  <div className="bg-[#4CAF50] text-white px-3 py-1 rounded text-xs font-medium">
                    Забронировано
                  </div>
                  <p className="text-xs text-neutral-600">Нет свободного времени</p>
                </div>
              </Card>
            </div>
          </section>

          {/* Статусные индикаторы */}
          <section className="mb-16">
            <h2 className="text-3xl font-semibold mb-8">Статусные индикаторы</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <StatusIndicator
                type="success"
                message="An esromessage"
              />

              <StatusIndicator
                type="error"
                message="An info message"
              />
            </div>
          </section>

          {/* Вкладки */}
          <section className="mb-16">
            <h2 className="text-3xl font-semibold mb-8">Вкладки</h2>
            
            <Card>
              <Tabs
                tabs={tabs}
                activeTab={activeTab}
                onTabChange={setActiveTab}
              />
            </Card>
          </section>



          {/* Цветовые кодировки */}
          <section className="mb-16">
            <h2 className="text-3xl font-semibold mb-8">Цветовые кодировки</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Brand Colors */}
              <Card>
                <h3 className="text-xl font-semibold mb-4">Брендовые цвета</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded border border-neutral-200 bg-[#F9F7F6]"></div>
                    <div className="flex-1">
                      <div className="text-sm font-medium">Pastel Base</div>
                      <div className="text-xs text-neutral-600 space-y-1">
                        <div>HEX: #F9F7F6</div>
                        <div>RGB: 249, 247, 246</div>
                        <div>CMYK: 0, 1, 1, 2</div>
                        <div>Использование: Основной фон</div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded border border-neutral-200 bg-[#E7E2DF]"></div>
                    <div className="flex-1">
                      <div className="text-sm font-medium">Mild Taupe</div>
                      <div className="text-xs text-neutral-600 space-y-1">
                        <div>HEX: #E7E2DF</div>
                        <div>RGB: 231, 226, 223</div>
                        <div>CMYK: 0, 2, 3, 9</div>
                        <div>Использование: Вторичные фоны</div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded border border-neutral-200 bg-[#DFF5EC]"></div>
                    <div className="flex-1">
                      <div className="text-sm font-medium">Cool Mint</div>
                      <div className="text-xs text-neutral-600 space-y-1">
                        <div>HEX: #DFF5EC</div>
                        <div>RGB: 223, 245, 236</div>
                        <div>CMYK: 9, 0, 4, 4</div>
                        <div>Использование: Градиентные элементы</div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded border border-neutral-200 bg-[#4CAF50]"></div>
                    <div className="flex-1">
                      <div className="text-sm font-medium">Vibrant Green</div>
                      <div className="text-xs text-neutral-600 space-y-1">
                        <div>HEX: #4CAF50</div>
                        <div>RGB: 76, 175, 80</div>
                        <div>CMYK: 57, 0, 54, 31</div>
                        <div>Использование: CTA кнопки, бейджи</div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded border border-neutral-200 bg-[#2D2D2D]"></div>
                    <div className="flex-1">
                      <div className="text-sm font-medium">Charcoal Text</div>
                      <div className="text-xs text-neutral-600 space-y-1">
                        <div>HEX: #2D2D2D</div>
                        <div>RGB: 45, 45, 45</div>
                        <div>CMYK: 0, 0, 0, 82</div>
                        <div>Использование: Заголовки</div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded border border-neutral-200 bg-[#909090]"></div>
                    <div className="flex-1">
                      <div className="text-sm font-medium">Warm Grey</div>
                      <div className="text-xs text-neutral-600 space-y-1">
                        <div>HEX: #909090</div>
                        <div>RGB: 144, 144, 144</div>
                        <div>CMYK: 0, 0, 0, 44</div>
                        <div>Использование: Основной текст</div>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Status Colors */}
              <Card>
                <h3 className="text-xl font-semibold mb-4">Статусные цвета</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded border border-neutral-200 bg-[#4CAF50]"></div>
                    <div className="flex-1">
                      <div className="text-sm font-medium">Успех</div>
                      <div className="text-xs text-neutral-600 space-y-1">
                        <div>HEX: #4CAF50</div>
                        <div>RGB: 76, 175, 80</div>
                        <div>CMYK: 57, 0, 54, 31</div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded border border-neutral-200 bg-warning-500"></div>
                    <div className="flex-1">
                      <div className="text-sm font-medium">Предупреждение</div>
                      <div className="text-xs text-neutral-600 space-y-1">
                        <div>HEX: #F59E0B</div>
                        <div>RGB: 245, 158, 11</div>
                        <div>CMYK: 0, 36, 96, 4</div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded border border-neutral-200 bg-error-500"></div>
                    <div className="flex-1">
                      <div className="text-sm font-medium">Ошибка</div>
                      <div className="text-xs text-neutral-600 space-y-1">
                        <div>HEX: #EF4444</div>
                        <div>RGB: 239, 68, 68</div>
                        <div>CMYK: 0, 72, 72, 6</div>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
} 