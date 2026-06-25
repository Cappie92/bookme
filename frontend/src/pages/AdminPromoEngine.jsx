import { useEffect, useMemo, useState } from 'react'
import {
  ChartBarIcon,
  CheckCircleIcon,
  PencilIcon,
  PlusIcon,
  TagIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { adminPromoEngineApi } from '../utils/adminPromoEngineApi'

const PAGE_LIMIT = 50
const CAMPAIGN_STATUSES = ['active', 'paused', 'archived']
const CAMPAIGN_TYPES = ['admin_campaign', 'master_referral', 'partner_campaign', 'manual']
const CAMPAIGN_CATEGORIES = ['acquisition', 'retention', 'upgrade', 'winback', 'compensation', 'other']
const CODE_STATUSES = ['active', 'disabled']
const REDEMPTION_STATUSES = ['pending_first_payment', 'redeemed', 'cancelled', 'expired']
const GRANT_STATUSES = ['pending', 'applied', 'cancelled', 'failed']

const EMPTY_CAMPAIGN_FORM = {
  name: '',
  promo_category: 'acquisition',
  type: 'admin_campaign',
  status: 'active',
  starts_at: '',
  ends_at: '',
  max_total_redemptions: '',
  max_redemptions_per_user: '1',
  first_payment_only: true,
  min_subscription_months: '3',
  eligible_roles: '["master","indie"]',
  beneficiary_reward_config: '{"1":0,"3":15,"6":20,"12":25}',
  referrer_reward_config: '',
}

const EMPTY_CODE_FORM = {
  campaign_id: '',
  code: '',
  status: 'active',
  max_redemptions: '',
  assigned_to_user_id: '',
}

function formatDate(value) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString('ru-RU', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return value
  }
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('ru-RU').replace(/\u00A0/g, ' ')
}

function toDateTimeLocal(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 16)
}

function parseJsonField(value, fieldName) {
  const trimmed = String(value || '').trim()
  if (!trimmed) return undefined
  try {
    const parsed = JSON.parse(trimmed)
    if (!Array.isArray(parsed) && (typeof parsed !== 'object' || parsed === null)) {
      throw new Error(`${fieldName} должен быть JSON object/array`)
    }
    return parsed
  } catch (error) {
    throw new Error(error.message || `${fieldName}: неверный JSON`)
  }
}

function cleanOptionalNumber(value) {
  if (value === '' || value == null) return undefined
  return Number(value)
}

function cleanOptionalDate(value) {
  if (!value) return undefined
  return new Date(value).toISOString()
}

function buildCampaignPayload(form, partial = false) {
  const payload = {
    name: form.name.trim(),
    promo_category: form.promo_category,
    type: form.type,
    status: form.status,
    starts_at: cleanOptionalDate(form.starts_at),
    ends_at: cleanOptionalDate(form.ends_at),
    max_total_redemptions: cleanOptionalNumber(form.max_total_redemptions),
    max_redemptions_per_user: cleanOptionalNumber(form.max_redemptions_per_user),
    first_payment_only: Boolean(form.first_payment_only),
    min_subscription_months: cleanOptionalNumber(form.min_subscription_months),
    eligible_roles: parseJsonField(form.eligible_roles, 'eligible_roles'),
    beneficiary_reward_config: parseJsonField(form.beneficiary_reward_config, 'beneficiary_reward_config'),
    referrer_reward_config: parseJsonField(form.referrer_reward_config, 'referrer_reward_config'),
  }
  Object.keys(payload).forEach((key) => {
    if (payload[key] === undefined || (partial && payload[key] === '')) delete payload[key]
  })
  return payload
}

function buildCodePayload(form, partial = false) {
  const payload = {
    campaign_id: cleanOptionalNumber(form.campaign_id),
    code: form.code.trim().toUpperCase(),
    status: form.status,
    max_redemptions: cleanOptionalNumber(form.max_redemptions),
    assigned_to_user_id: cleanOptionalNumber(form.assigned_to_user_id),
  }
  Object.keys(payload).forEach((key) => {
    if (payload[key] === undefined || (partial && payload[key] === '')) delete payload[key]
  })
  if (partial) delete payload.campaign_id
  return payload
}

function statusBadgeClass(status) {
  if (status === 'active' || status === 'redeemed' || status === 'applied') {
    return 'bg-green-100 text-green-800'
  }
  if (status === 'pending' || status === 'pending_first_payment' || status === 'paused') {
    return 'bg-yellow-100 text-yellow-800'
  }
  return 'bg-gray-100 text-gray-800'
}

function StatCard({ title, value, subtitle, icon: Icon, color = 'blue' }) {
  const colors = {
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
    purple: 'bg-purple-100 text-purple-600',
    orange: 'bg-orange-100 text-orange-600',
  }
  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
      <div className="flex items-center">
        <div className={`p-2 rounded-lg ${colors[color] || colors.blue}`}>
          <Icon className="w-6 h-6" />
        </div>
        <div className="ml-4">
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{formatNumber(value)}</p>
          {subtitle ? <p className="text-xs text-gray-500">{subtitle}</p> : null}
        </div>
      </div>
    </div>
  )
}

function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-white rounded-lg shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

function Pagination({ data, onPrev, onNext }) {
  if (!data) return null
  const canPrev = data.skip > 0
  const canNext = data.skip + data.limit < data.total
  return (
    <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200">
      <p className="text-sm text-gray-600">
        Показано {data.items.length} из {data.total}
      </p>
      <div className="flex gap-2">
        <button
          onClick={onPrev}
          disabled={!canPrev}
          className="px-3 py-2 text-sm border border-gray-300 rounded disabled:opacity-50"
        >
          Назад
        </button>
        <button
          onClick={onNext}
          disabled={!canNext}
          className="px-3 py-2 text-sm border border-gray-300 rounded disabled:opacity-50"
        >
          Далее
        </button>
      </div>
    </div>
  )
}

function ErrorBlock({ error }) {
  if (!error) return null
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
      {error}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-700 mb-1">{label}</span>
      {children}
    </label>
  )
}

function textInputClass() {
  return 'w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#4CAF50]'
}

export default function AdminPromoEngine() {
  const [activeTab, setActiveTab] = useState('campaigns')
  const [stats, setStats] = useState(null)
  const [lists, setLists] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState({
    campaigns: { status: '', type: '', search: '', skip: 0 },
    codes: { campaign_id: '', status: '', search: '', skip: 0 },
    redemptions: { campaign_id: '', code_id: '', status: '', redeemer_master_id: '', skip: 0 },
    grants: { campaign_id: '', code_id: '', status: '', recipient_master_id: '', skip: 0 },
    ledger: { master_id: '', source_type: '', skip: 0 },
  })
  const [campaignModal, setCampaignModal] = useState(null)
  const [campaignForm, setCampaignForm] = useState(EMPTY_CAMPAIGN_FORM)
  const [codeModal, setCodeModal] = useState(null)
  const [codeForm, setCodeForm] = useState(EMPTY_CODE_FORM)
  const [formError, setFormError] = useState('')

  const tabs = useMemo(() => [
    { id: 'campaigns', label: 'Кампании' },
    { id: 'codes', label: 'Коды' },
    { id: 'redemptions', label: 'Активации' },
    { id: 'grants', label: 'Начисления' },
    { id: 'ledger', label: 'История баллов' },
  ], [])

  const loadStats = async () => {
    const data = await adminPromoEngineApi.getStats()
    setStats(data)
  }

  const loadList = async (tab = activeTab) => {
    const params = { ...(filters[tab] || {}), limit: PAGE_LIMIT }
    let data
    if (tab === 'campaigns') data = await adminPromoEngineApi.listCampaigns(params)
    if (tab === 'codes') data = await adminPromoEngineApi.listCodes(params)
    if (tab === 'redemptions') data = await adminPromoEngineApi.listRedemptions(params)
    if (tab === 'grants') data = await adminPromoEngineApi.listGrants(params)
    if (tab === 'ledger') data = await adminPromoEngineApi.listLedger(params)
    setLists(prev => ({ ...prev, [tab]: data }))
  }

  const loadData = async (tab = activeTab) => {
    try {
      setLoading(true)
      setError('')
      await Promise.all([loadStats(), loadList(tab)])
    } catch (err) {
      setError(err.message || 'Не удалось загрузить данные promo-engine')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData(activeTab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, filters])

  const updateFilter = (tab, key, value) => {
    setFilters(prev => ({
      ...prev,
      [tab]: {
        ...prev[tab],
        [key]: value,
        skip: key === 'skip' ? value : 0,
      },
    }))
  }

  const changePage = (tab, direction) => {
    const current = lists[tab]
    if (!current) return
    const nextSkip = Math.max(0, current.skip + direction * PAGE_LIMIT)
    updateFilter(tab, 'skip', nextSkip)
  }

  const openCreateCampaign = () => {
    setCampaignForm(EMPTY_CAMPAIGN_FORM)
    setCampaignModal({ mode: 'create' })
    setFormError('')
  }

  const openEditCampaign = (campaign) => {
    setCampaignForm({
      name: campaign.name || '',
      promo_category: campaign.promo_category || 'acquisition',
      type: campaign.type || 'admin_campaign',
      status: campaign.status || 'active',
      starts_at: toDateTimeLocal(campaign.starts_at),
      ends_at: toDateTimeLocal(campaign.ends_at),
      max_total_redemptions: campaign.max_total_redemptions ?? '',
      max_redemptions_per_user: campaign.max_redemptions_per_user ?? '1',
      first_payment_only: Boolean(campaign.first_payment_only),
      min_subscription_months: campaign.eligible_period_months?.[0] ?? '',
      eligible_roles: '["master","indie"]',
      beneficiary_reward_config: JSON.stringify(campaign.beneficiary_reward_config || {}),
      referrer_reward_config: campaign.referrer_reward_config ? JSON.stringify(campaign.referrer_reward_config) : '',
    })
    setCampaignModal({ mode: 'edit', item: campaign })
    setFormError('')
  }

  const saveCampaign = async () => {
    try {
      setFormError('')
      const payload = buildCampaignPayload(campaignForm, campaignModal?.mode === 'edit')
      if (campaignModal?.mode === 'edit') {
        await adminPromoEngineApi.updateCampaign(campaignModal.item.id, payload)
      } else {
        await adminPromoEngineApi.createCampaign(payload)
      }
      setCampaignModal(null)
      await loadData('campaigns')
    } catch (err) {
      setFormError(err.message || 'Не удалось сохранить кампанию')
    }
  }

  const openCreateCode = () => {
    setCodeForm(EMPTY_CODE_FORM)
    setCodeModal({ mode: 'create' })
    setFormError('')
  }

  const openEditCode = (code) => {
    setCodeForm({
      campaign_id: code.campaign_id || '',
      code: code.code || '',
      status: code.status || 'active',
      max_redemptions: code.max_redemptions ?? '',
      assigned_to_user_id: code.assigned_to_user_id ?? '',
    })
    setCodeModal({ mode: 'edit', item: code })
    setFormError('')
  }

  const saveCode = async () => {
    try {
      setFormError('')
      const payload = buildCodePayload(codeForm, codeModal?.mode === 'edit')
      if (codeModal?.mode === 'edit') {
        await adminPromoEngineApi.updateCode(codeModal.item.id, payload)
      } else {
        await adminPromoEngineApi.createCode(payload)
      }
      setCodeModal(null)
      await loadData('codes')
    } catch (err) {
      setFormError(err.message || 'Не удалось сохранить код')
    }
  }

  const renderTableShell = (title, children, actions = null) => (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        {actions}
      </div>
      {loading ? (
        <div className="p-6 text-gray-600">Загрузка...</div>
      ) : (
        children
      )}
    </div>
  )

  const renderCampaigns = () => {
    const data = lists.campaigns
    return (
      <div className="space-y-4">
        <div className="bg-white p-4 rounded-lg border border-gray-200 grid grid-cols-1 md:grid-cols-4 gap-3">
          <select value={filters.campaigns.status} onChange={e => updateFilter('campaigns', 'status', e.target.value)} className={textInputClass()}>
            <option value="">Все статусы</option>
            {CAMPAIGN_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}
          </select>
          <select value={filters.campaigns.type} onChange={e => updateFilter('campaigns', 'type', e.target.value)} className={textInputClass()}>
            <option value="">Все типы</option>
            {CAMPAIGN_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
          </select>
          <input value={filters.campaigns.search} onChange={e => updateFilter('campaigns', 'search', e.target.value)} placeholder="Поиск по названию" className={textInputClass()} />
          <button onClick={openCreateCampaign} className="inline-flex items-center justify-center px-4 py-2 bg-[#4CAF50] text-white rounded-md hover:bg-[#43A047]">
            <PlusIcon className="w-5 h-5 mr-2" /> Кампания
          </button>
        </div>
        {renderTableShell('Кампании promo-engine', (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {['ID', 'Название', 'Категория/тип', 'Статус', 'Даты', 'Лимиты', 'Статистика', ''].map(head => (
                      <th key={head} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{head}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {(data?.items || []).map(campaign => (
                    <tr key={campaign.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">#{campaign.id}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{campaign.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{campaign.promo_category}<br />{campaign.type}</td>
                      <td className="px-4 py-3"><span className={`px-2 py-1 text-xs rounded-full ${statusBadgeClass(campaign.status)}`}>{campaign.status}</span></td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatDate(campaign.starts_at)}<br />{formatDate(campaign.ends_at)}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">Всего: {campaign.max_total_redemptions ?? '∞'}<br />На мастера: {campaign.max_redemptions_per_user}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        Коды: {campaign.stats?.codes_count ?? 0}<br />
                        Активации: {campaign.stats?.redemptions_count ?? 0}<br />
                        Баллы: {campaign.stats?.points_granted ?? 0}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => openEditCampaign(campaign)} className="text-blue-600 hover:text-blue-800">
                          <PencilIcon className="w-5 h-5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination data={data} onPrev={() => changePage('campaigns', -1)} onNext={() => changePage('campaigns', 1)} />
          </>
        ))}
      </div>
    )
  }

  const renderCodes = () => {
    const data = lists.codes
    return (
      <div className="space-y-4">
        <div className="bg-white p-4 rounded-lg border border-gray-200 grid grid-cols-1 md:grid-cols-4 gap-3">
          <input value={filters.codes.campaign_id} onChange={e => updateFilter('codes', 'campaign_id', e.target.value)} placeholder="campaign_id" className={textInputClass()} />
          <select value={filters.codes.status} onChange={e => updateFilter('codes', 'status', e.target.value)} className={textInputClass()}>
            <option value="">Все статусы</option>
            {CODE_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}
          </select>
          <input value={filters.codes.search} onChange={e => updateFilter('codes', 'search', e.target.value.toUpperCase())} placeholder="Поиск по коду" className={textInputClass()} />
          <button onClick={openCreateCode} className="inline-flex items-center justify-center px-4 py-2 bg-[#4CAF50] text-white rounded-md hover:bg-[#43A047]">
            <PlusIcon className="w-5 h-5 mr-2" /> Код
          </button>
        </div>
        {renderTableShell('Коды promo-engine', (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {['Код', 'Кампания', 'Статус', 'Использования', 'Назначен', 'Создан', ''].map(head => (
                      <th key={head} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{head}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {(data?.items || []).map(code => (
                    <tr key={code.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-mono font-semibold text-gray-900">{code.code}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">#{code.campaign_id}<br />{code.campaign_name || '—'}</td>
                      <td className="px-4 py-3"><span className={`px-2 py-1 text-xs rounded-full ${statusBadgeClass(code.status)}`}>{code.status}</span></td>
                      <td className="px-4 py-3 text-sm text-gray-600">{code.current_redemptions} / {code.max_redemptions ?? '∞'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{code.assigned_to_user_id || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatDate(code.created_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => openEditCode(code)} className="text-blue-600 hover:text-blue-800">
                          <PencilIcon className="w-5 h-5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination data={data} onPrev={() => changePage('codes', -1)} onNext={() => changePage('codes', 1)} />
          </>
        ))}
      </div>
    )
  }

  const renderSimpleFilters = (tab, fields) => (
    <div className="bg-white p-4 rounded-lg border border-gray-200 grid grid-cols-1 md:grid-cols-4 gap-3">
      {fields.map(field => (
        field.type === 'select' ? (
          <select key={field.key} value={filters[tab][field.key]} onChange={e => updateFilter(tab, field.key, e.target.value)} className={textInputClass()}>
            <option value="">{field.placeholder}</option>
            {field.options.map(option => <option key={option} value={option}>{option}</option>)}
          </select>
        ) : (
          <input key={field.key} value={filters[tab][field.key]} onChange={e => updateFilter(tab, field.key, e.target.value)} placeholder={field.placeholder} className={textInputClass()} />
        )
      ))}
    </div>
  )

  const renderRedemptions = () => {
    const data = lists.redemptions
    return (
      <div className="space-y-4">
        {renderSimpleFilters('redemptions', [
          { key: 'campaign_id', placeholder: 'campaign_id' },
          { key: 'code_id', placeholder: 'code_id' },
          { key: 'status', placeholder: 'Все статусы', type: 'select', options: REDEMPTION_STATUSES },
          { key: 'redeemer_master_id', placeholder: 'redeemer_master_id' },
        ])}
        {renderTableShell('Активации промокодов', (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50"><tr>{['ID', 'Код', 'Статус', 'Мастер', 'Реферер', 'Оплата', 'Дата'].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-gray-200">
                  {(data?.items || []).map(item => (
                    <tr key={item.id}>
                      <td className="px-4 py-3 text-sm">#{item.id}</td>
                      <td className="px-4 py-3 text-sm font-mono">{item.code || `#${item.code_id}`}</td>
                      <td className="px-4 py-3"><span className={`px-2 py-1 text-xs rounded-full ${statusBadgeClass(item.status)}`}>{item.status}</span></td>
                      <td className="px-4 py-3 text-sm">{item.redeemer_master_id}</td>
                      <td className="px-4 py-3 text-sm">{item.referrer_master_id || '—'}</td>
                      <td className="px-4 py-3 text-sm">#{item.first_payment_id || '—'}<br />{item.first_payment_amount || 0} ₽ / {item.first_payment_period_months || '—'} мес.</td>
                      <td className="px-4 py-3 text-sm">{formatDate(item.applied_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination data={data} onPrev={() => changePage('redemptions', -1)} onNext={() => changePage('redemptions', 1)} />
          </>
        ))}
      </div>
    )
  }

  const renderGrants = () => {
    const data = lists.grants
    return (
      <div className="space-y-4">
        {renderSimpleFilters('grants', [
          { key: 'campaign_id', placeholder: 'campaign_id' },
          { key: 'code_id', placeholder: 'code_id' },
          { key: 'status', placeholder: 'Все статусы', type: 'select', options: GRANT_STATUSES },
          { key: 'recipient_master_id', placeholder: 'recipient_master_id' },
        ])}
        {renderTableShell('Начисления бонусных баллов подписки', (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50"><tr>{['ID', 'Redemption', 'Получатель', 'Роль', 'Статус', 'База/%', 'Баллы', 'Ledger'].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-gray-200">
                  {(data?.items || []).map(item => (
                    <tr key={item.id}>
                      <td className="px-4 py-3 text-sm">#{item.id}</td>
                      <td className="px-4 py-3 text-sm">#{item.redemption_id}</td>
                      <td className="px-4 py-3 text-sm">{item.recipient_master_id}</td>
                      <td className="px-4 py-3 text-sm">{item.recipient_role}</td>
                      <td className="px-4 py-3"><span className={`px-2 py-1 text-xs rounded-full ${statusBadgeClass(item.status)}`}>{item.status}</span></td>
                      <td className="px-4 py-3 text-sm">{item.base_amount || 0} ₽ / {item.percent || 0}%</td>
                      <td className="px-4 py-3 text-sm font-semibold">{formatNumber(item.points_amount)}</td>
                      <td className="px-4 py-3 text-sm">#{item.ledger_entry_id || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination data={data} onPrev={() => changePage('grants', -1)} onNext={() => changePage('grants', 1)} />
          </>
        ))}
      </div>
    )
  }

  const renderLedger = () => {
    const data = lists.ledger
    return (
      <div className="space-y-4">
        {renderSimpleFilters('ledger', [
          { key: 'master_id', placeholder: 'master_id' },
          { key: 'source_type', placeholder: 'source_type' },
        ])}
        {renderTableShell('История бонусных баллов подписки', (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50"><tr>{['ID', 'Мастер', 'Сумма', 'Остаток', 'Тип', 'Источник', 'Статус', 'Дата'].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-gray-200">
                  {(data?.items || []).map(item => (
                    <tr key={item.id}>
                      <td className="px-4 py-3 text-sm">#{item.id}</td>
                      <td className="px-4 py-3 text-sm">{item.master_id}</td>
                      <td className="px-4 py-3 text-sm font-semibold">{formatNumber(item.amount)}</td>
                      <td className="px-4 py-3 text-sm">{formatNumber(item.remaining_amount)}</td>
                      <td className="px-4 py-3 text-sm">{item.direction}</td>
                      <td className="px-4 py-3 text-sm">{item.source_type} #{item.source_id || '—'}</td>
                      <td className="px-4 py-3"><span className={`px-2 py-1 text-xs rounded-full ${statusBadgeClass(item.status)}`}>{item.status}</span></td>
                      <td className="px-4 py-3 text-sm">{formatDate(item.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination data={data} onPrev={() => changePage('ledger', -1)} onNext={() => changePage('ledger', 1)} />
          </>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Промокоды</h1>
        <p className="text-gray-600">
          Управление promo-engine кампаниями и бонусными баллами подписки. Legacy PromoCode не используется.
        </p>
      </div>

      <ErrorBlock error={error} />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard title="Кампании" value={stats?.total_campaigns} subtitle={`Активных: ${formatNumber(stats?.active_campaigns)}`} icon={TagIcon} color="blue" />
        <StatCard title="Коды" value={stats?.total_codes} subtitle={`Активных: ${formatNumber(stats?.active_codes)}`} icon={CheckCircleIcon} color="green" />
        <StatCard title="Активации" value={stats?.total_redemptions} subtitle={`Pending: ${formatNumber(stats?.pending_redemptions)} / Redeemed: ${formatNumber(stats?.redeemed_redemptions)}`} icon={ChartBarIcon} color="purple" />
        <StatCard title="Бонусные баллы подписки" value={stats?.total_points_granted} subtitle={`Ledger: ${formatNumber(stats?.total_ledger_points)}`} icon={ChartBarIcon} color="orange" />
      </div>

      <div className="bg-white rounded-lg border border-gray-200">
        <div className="flex flex-wrap border-b border-gray-200">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3 text-sm font-semibold ${
                activeTab === tab.id
                  ? 'border-b-2 border-[#4CAF50] text-[#2E7D32]'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'campaigns' && renderCampaigns()}
      {activeTab === 'codes' && renderCodes()}
      {activeTab === 'redemptions' && renderRedemptions()}
      {activeTab === 'grants' && renderGrants()}
      {activeTab === 'ledger' && renderLedger()}

      {campaignModal ? (
        <Modal
          title={campaignModal.mode === 'edit' ? 'Редактировать кампанию' : 'Создать кампанию'}
          onClose={() => setCampaignModal(null)}
        >
          <div className="space-y-4">
            <ErrorBlock error={formError} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Название">
                <input value={campaignForm.name} onChange={e => setCampaignForm(prev => ({ ...prev, name: e.target.value }))} className={textInputClass()} />
              </Field>
              <Field label="Статус">
                <select value={campaignForm.status} onChange={e => setCampaignForm(prev => ({ ...prev, status: e.target.value }))} className={textInputClass()}>
                  {CAMPAIGN_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}
                </select>
              </Field>
              <Field label="Категория">
                <select value={campaignForm.promo_category} onChange={e => setCampaignForm(prev => ({ ...prev, promo_category: e.target.value }))} className={textInputClass()}>
                  {CAMPAIGN_CATEGORIES.map(category => <option key={category} value={category}>{category}</option>)}
                </select>
              </Field>
              <Field label="Тип">
                <select value={campaignForm.type} onChange={e => setCampaignForm(prev => ({ ...prev, type: e.target.value }))} className={textInputClass()}>
                  {CAMPAIGN_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                </select>
              </Field>
              <Field label="Начало">
                <input type="datetime-local" value={campaignForm.starts_at} onChange={e => setCampaignForm(prev => ({ ...prev, starts_at: e.target.value }))} className={textInputClass()} />
              </Field>
              <Field label="Окончание">
                <input type="datetime-local" value={campaignForm.ends_at} onChange={e => setCampaignForm(prev => ({ ...prev, ends_at: e.target.value }))} className={textInputClass()} />
              </Field>
              <Field label="Лимит кампании">
                <input type="number" min="0" value={campaignForm.max_total_redemptions} onChange={e => setCampaignForm(prev => ({ ...prev, max_total_redemptions: e.target.value }))} className={textInputClass()} />
              </Field>
              <Field label="Лимит на мастера">
                <input type="number" min="1" value={campaignForm.max_redemptions_per_user} onChange={e => setCampaignForm(prev => ({ ...prev, max_redemptions_per_user: e.target.value }))} className={textInputClass()} />
              </Field>
              <Field label="Минимум месяцев">
                <input type="number" min="1" value={campaignForm.min_subscription_months} onChange={e => setCampaignForm(prev => ({ ...prev, min_subscription_months: e.target.value }))} className={textInputClass()} />
              </Field>
              <label className="flex items-center gap-2 text-sm text-gray-700 pt-7">
                <input type="checkbox" checked={campaignForm.first_payment_only} onChange={e => setCampaignForm(prev => ({ ...prev, first_payment_only: e.target.checked }))} />
                Только первая оплата
              </label>
            </div>
            <Field label="eligible_roles JSON">
              <textarea value={campaignForm.eligible_roles} onChange={e => setCampaignForm(prev => ({ ...prev, eligible_roles: e.target.value }))} className={`${textInputClass()} font-mono text-sm`} rows={2} />
            </Field>
            <Field label="beneficiary_reward_config JSON">
              <textarea value={campaignForm.beneficiary_reward_config} onChange={e => setCampaignForm(prev => ({ ...prev, beneficiary_reward_config: e.target.value }))} className={`${textInputClass()} font-mono text-sm`} rows={3} />
            </Field>
            <Field label="referrer_reward_config JSON">
              <textarea value={campaignForm.referrer_reward_config} onChange={e => setCampaignForm(prev => ({ ...prev, referrer_reward_config: e.target.value }))} className={`${textInputClass()} font-mono text-sm`} rows={3} />
            </Field>
            <div className="flex justify-end gap-3">
              <button onClick={() => setCampaignModal(null)} className="px-4 py-2 border border-gray-300 rounded-md">Отмена</button>
              <button onClick={saveCampaign} className="px-4 py-2 bg-[#4CAF50] text-white rounded-md">Сохранить</button>
            </div>
          </div>
        </Modal>
      ) : null}

      {codeModal ? (
        <Modal
          title={codeModal.mode === 'edit' ? 'Редактировать код' : 'Создать код'}
          onClose={() => setCodeModal(null)}
        >
          <div className="space-y-4">
            <ErrorBlock error={formError} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {codeModal.mode === 'create' ? (
                <Field label="campaign_id">
                  <input type="number" value={codeForm.campaign_id} onChange={e => setCodeForm(prev => ({ ...prev, campaign_id: e.target.value }))} className={textInputClass()} />
                </Field>
              ) : null}
              <Field label="Код">
                <input value={codeForm.code} onChange={e => setCodeForm(prev => ({ ...prev, code: e.target.value.trim().toUpperCase() }))} className={`${textInputClass()} font-mono`} />
              </Field>
              <Field label="Статус">
                <select value={codeForm.status} onChange={e => setCodeForm(prev => ({ ...prev, status: e.target.value }))} className={textInputClass()}>
                  {CODE_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}
                </select>
              </Field>
              <Field label="Максимум активаций">
                <input type="number" min="0" value={codeForm.max_redemptions} onChange={e => setCodeForm(prev => ({ ...prev, max_redemptions: e.target.value }))} className={textInputClass()} />
              </Field>
              <Field label="assigned_to_user_id">
                <input type="number" value={codeForm.assigned_to_user_id} onChange={e => setCodeForm(prev => ({ ...prev, assigned_to_user_id: e.target.value }))} className={textInputClass()} />
              </Field>
            </div>
            <p className="text-sm text-gray-600">Код нормализуется в верхний регистр. Удаления нет, код можно отключить статусом disabled.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setCodeModal(null)} className="px-4 py-2 border border-gray-300 rounded-md">Отмена</button>
              <button onClick={saveCode} className="px-4 py-2 bg-[#4CAF50] text-white rounded-md">Сохранить</button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}
