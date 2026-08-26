import LegalDocumentLayout from './legal/LegalDocumentLayout'

const sectionTitleClass =
  'text-lg sm:text-xl font-bold text-[#1C1917] tracking-tight mt-8 first:mt-0 mb-3'
const paragraphClass = 'text-[15px] sm:text-base leading-relaxed text-neutral-800 mb-3'
const listClass = 'list-disc pl-5 sm:pl-6 space-y-1.5 text-neutral-800 mb-3'
const orderedClass = 'list-decimal pl-5 sm:pl-6 space-y-1.5 text-neutral-800 mb-3'

/**
 * Публичная инструкция по удалению аккаунта DeDato (требование Google Play).
 * Без авторизации, без форм, без API.
 */
export default function AccountDeletionPage() {
  return (
    <LegalDocumentLayout
      title="Удаление аккаунта DeDato"
      documentTitle="Удаление аккаунта DeDato"
      pageTitle="Удаление аккаунта DeDato"
      description="Инструкция по удалению аккаунта DeDato и информация об удалении, обезличивании и хранении связанных данных."
      robots="index, follow"
    >
      <p className={paragraphClass}>
        Вы можете самостоятельно удалить аккаунт DeDato в настройках профиля. После подтверждения
        аккаунт будет необратимо деактивирован, доступ к нему будет закрыт, а персональные данные
        будут удалены или обезличены.
      </p>

      <h2 className={sectionTitleClass}>Как удалить аккаунт клиента</h2>
      <ol className={orderedClass}>
        <li>Откройте приложение DeDato или войдите в свой аккаунт на сайте.</li>
        <li>Перейдите в раздел «Профиль» или «Настройки».</li>
        <li>Нажмите «Удалить аккаунт».</li>
        <li>Введите пароль и подтвердите удаление.</li>
      </ol>

      <h2 className={sectionTitleClass}>Как удалить аккаунт мастера</h2>
      <ol className={orderedClass}>
        <li>Откройте настройки аккаунта мастера в доступной версии DeDato.</li>
        <li>Нажмите «Удалить аккаунт».</li>
        <li>Запросите звонок с кодом подтверждения на номер телефона, указанный в профиле.</li>
        <li>Введите полученный код и подтвердите удаление.</li>
      </ol>

      <h2 className={sectionTitleClass}>Какие данные удаляются или обезличиваются</h2>
      <p className={paragraphClass}>После удаления аккаунта удаляются или обезличиваются:</p>
      <ul className={listClass}>
        <li>имя и другие данные профиля;</li>
        <li>номер телефона и адрес электронной почты;</li>
        <li>данные для входа и связанные способы авторизации;</li>
        <li>фотографии и публичные данные профиля;</li>
        <li>активное расписание и настройки доступности;</li>
        <li>публичная страница записи;</li>
        <li>актуальные услуги и цены;</li>
        <li>программы лояльности, скидки, ограничения и связанные настройки;</li>
        <li>другие персональные данные, которые больше не требуются для работы сервиса.</li>
      </ul>
      <p className={paragraphClass}>Для аккаунта мастера будущие записи отменяются.</p>

      <h2 className={sectionTitleClass}>Какие данные могут сохраняться</h2>
      <p className={paragraphClass}>
        Чтобы не нарушать историю других пользователей и выполнять требования законодательства,
        отдельные данные могут сохраняться в обезличенном или техническом виде:
      </p>
      <ul className={listClass}>
        <li>история завершённых и отменённых записей;</li>
        <li>технические идентификаторы, необходимые для целостности истории;</li>
        <li>сведения о платежах, подписках и финансовых операциях;</li>
        <li>технические журналы и резервные копии в пределах установленных сроков хранения.</li>
      </ul>
      <p className={paragraphClass}>
        В сохранённой истории имя удалённого пользователя заменяется техническим обозначением,
        например «Удалённый мастер №13» или «Удалённый клиент №13». Персональные данные удалённого
        пользователя другим пользователям не показываются.
      </p>

      <h2 className={sectionTitleClass}>Что происходит после удаления</h2>
      <p className={paragraphClass}>После удаления:</p>
      <ul className={listClass}>
        <li>вход в аккаунт становится невозможен;</li>
        <li>активные сессии и токены перестают предоставлять доступ;</li>
        <li>публичная страница и возможность новой записи становятся недоступны;</li>
        <li>
          прежний номер телефона и адрес электронной почты могут быть использованы для новой
          регистрации;
        </li>
        <li>отменить удаление и восстановить прежний аккаунт невозможно.</li>
      </ul>

      <h2 className={sectionTitleClass}>Подписка App Store</h2>
      <p className={paragraphClass}>
        Если у вас есть активная подписка, приобретённая через Apple In-App Purchase, удаление
        аккаунта DeDato не отменяет Apple auto-renewal. Управление списаниями выполняется отдельно
        в настройках подписок Apple. Если вы не хотите последующих списаний, отключите
        автопродление через «Manage Subscription».
      </p>
      <p className={paragraphClass}>
        Вы можете продолжить немедленное удаление аккаунта, не дожидаясь окончания подписки.
        Запрос возврата платежа Apple и удаление аккаунта DeDato являются разными процессами.
      </p>

      <h2 className={sectionTitleClass}>Срок обработки</h2>
      <p className={paragraphClass}>
        При самостоятельном удалении изменения применяются после подтверждения операции.
        Обезличенные технические и финансовые данные могут храниться в течение сроков, необходимых
        для работы сервиса и выполнения требований законодательства.
      </p>

      <h2 className={sectionTitleClass}>Нужна помощь?</h2>
      <p className={paragraphClass}>
        Если вы не можете удалить аккаунт самостоятельно, обратитесь в поддержку DeDato:
      </p>
      <p className={`${paragraphClass} mb-0`}>
        <a
          href="mailto:support@dedato.ru?subject=%D0%A3%D0%B4%D0%B0%D0%BB%D0%B5%D0%BD%D0%B8%D0%B5%20%D0%B0%D0%BA%D0%BA%D0%B0%D1%83%D0%BD%D1%82%D0%B0%20DeDato"
          className="text-[#4CAF50] font-medium underline underline-offset-2 hover:text-[#45A049]"
        >
          support@dedato.ru
        </a>
      </p>
    </LegalDocumentLayout>
  )
}
