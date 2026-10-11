import { Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'

const sectionTitleClass =
  'text-lg sm:text-xl font-bold text-[#1C1917] tracking-tight mt-8 mb-3'
const paragraphClass = 'text-[15px] sm:text-base leading-relaxed text-neutral-800 mb-3'
const listClass = 'list-disc pl-5 sm:pl-6 space-y-1.5 text-neutral-800 mb-3'

const RU_FEATURES = [
  'вход, регистрация и управление аккаунтом',
  'просмотр и управление записями',
  'подтверждение, отмена и перенос записей',
  'управление рабочим расписанием',
  'управление услугами и категориями',
  'отображение цен реальных услуг',
  'базовая сводка по работе на главном экране',
  'базовый профиль и информация публичной страницы мастера',
  'запись клиентов на реальные услуги',
  'операционные уведомления',
  'настройки и безопасность аккаунта',
]

const EN_FEATURES = [
  'sign-in, registration and account management',
  'viewing and managing bookings',
  'confirming, cancelling and rescheduling bookings',
  'managing the work schedule',
  'managing services and categories',
  'displaying prices of real-world services',
  'a basic work summary on the home screen',
  'a basic profile and public page information',
  'booking clients for real-world services',
  'operational notifications',
  'account settings and security',
]

export default function IosFreeCompanionPage() {
  return (
    <div className="flex flex-col min-h-screen bg-[#F9F7F6]">
      <Helmet>
        <title>DeDato для iOS — бесплатный компаньон</title>
        <meta
          name="description"
          content="Версия DeDato для iOS — бесплатный компаньон с базовыми функциями записи, расписания и услуг."
        />
        <meta name="robots" content="index, follow" />
      </Helmet>
      <header className="px-4 sm:px-6 pt-8">
        <p className="max-w-3xl mx-auto text-lg font-semibold text-[#1C1917]">DeDato</p>
      </header>
      <main className="flex-1 w-full pb-12 sm:pb-16 px-4 sm:px-6">
        <article className="max-w-3xl mx-auto bg-white rounded-2xl border border-[#E7E2DF] shadow-sm px-4 sm:px-8 md:px-10 py-8 sm:py-10">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-[#1C1917] tracking-tight leading-tight mb-2">
            DeDato для iOS — бесплатный компаньон
          </h1>
      <h2 className={sectionTitleClass}>Что доступно в версии для iOS</h2>
      <p className={paragraphClass}>
        Мобильное приложение DeDato для iOS, распространяемое через Apple App Store, является
        бесплатным приложением-компаньоном. В нём доступны только базовые бесплатные функции.
      </p>
      <ul className={listClass}>
        {RU_FEATURES.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p className={paragraphClass}>
        Платные функции веб-сервиса не включены в приложение и не становятся доступными при наличии
        веб-подписки или иного статуса оплаты. Такой статус не открывает дополнительные экраны,
        элементы управления, цифровой контент или операционные возможности iOS.
      </p>
      <p className={paragraphClass}>
        В приложении для iOS нет покупки цифровой подписки, сценария улучшения тарифа и призыва
        перейти к внешней оплате цифровых функций.
      </p>
      <p className={paragraphClass}>
        Цены, отображаемые при записи, относятся к реальным услугам специалистов и не являются
        ценами цифровых функций DeDato. Денежная скидка изменяет стоимость реальной услуги и сама
        по себе не открывает цифровую функцию приложения.
      </p>

      <h2 className={sectionTitleClass}>DeDato for iOS — Free Companion</h2>
      <p className={paragraphClass}>
        DeDato for iOS is a free stand-alone companion app. The App Store version provides only the
        basic free functionality listed on this page. An existing web billing or subscription status
        does not unlock additional native iOS screens, controls, digital content, or operational
        capabilities.
      </p>
      <p className={paragraphClass}>
        The iOS app does not offer digital subscription purchases, upgrade flows, or external
        checkout calls to action.
      </p>
      <p className={paragraphClass}>
        Prices shown while booking are prices for real-world services provided by professionals and
        are not prices for digital DeDato functionality.
      </p>
      <ul className={listClass}>
        {EN_FEATURES.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      <h2 className={sectionTitleClass}>Документы и поддержка</h2>
      <ul className={listClass}>
        <li>
          <Link to="/user-agreement">Пользовательское соглашение</Link>
        </li>
        <li>
          <Link to="/privacy-policy">Политика конфиденциальности</Link>
        </li>
        <li>
          <a href="mailto:support@dedato.ru">support@dedato.ru</a>
        </li>
        </ul>
        </article>
      </main>
    </div>
  )
}
