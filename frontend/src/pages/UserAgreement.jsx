import Header from "../components/Header"

export default function UserAgreement() {
  return (
    <div className="flex flex-col min-h-screen w-full">
      <Header openAuthModal={() => {}} />
      <main className="flex-1 w-full bg-[#F9F7F6]" style={{marginTop:200, paddingLeft:'15%', paddingRight:'15%', paddingBottom:'60px'}}>
        <div>
          <h1>Пользовательское соглашение</h1>
          <p>Простая версия для тестирования</p>
          <p>Здесь будет полный текст соглашения</p>
          <p>Контактная информация:</p>
          <p>ООО «Appointo»</p>
          <p>E-mail: support@appointo.ru</p>
          <p>Дата последнего обновления: 26 июня 2025 г.</p>
        </div>
      </main>
    </div>
  )
} 