import { readFileSync } from 'node:fs'
import { parse } from '@babel/parser'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => ({
  states: [], cursor: 0, ios: false,
  purchase: vi.fn(), tariff: vi.fn(), post: vi.fn(), put: vi.fn(),
}))

// Shallow-render the real JSX and exercise its real event callbacks. Effects
// are intentionally suppressed: this test needs no DOM, providers or network.
vi.mock('react', async (original) => ({
  ...await original(),
  useState: (initial) => {
    const index = harness.cursor++
    if (!(index in harness.states)) {
      harness.states[index] = index === 0 ? { weeks_data: [{ is_current: true }] }
        : index === 1 ? false : typeof initial === 'function' ? initial() : initial
    }
    return [harness.states[index], (value) => {
      harness.states[index] = typeof value === 'function' ? value(harness.states[index]) : value
    }]
  },
  useEffect: () => {},
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
  useRef: (current) => ({ current }),
}))
vi.mock('react-router-dom', async (original) => ({
  ...await original(), useNavigate: () => vi.fn(),
}))
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ isIosAppWebSession: harness.ios }) }))
vi.mock('../contexts/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }))
vi.mock('../utils/api', () => ({
  apiGet: vi.fn(), apiPost: harness.post, apiPut: harness.put, apiDelete: vi.fn(),
}))

import MasterDashboardStats from './MasterDashboardStats'

function nodes(value) {
  if (Array.isArray(value)) return value.flatMap(nodes)
  if (!value || typeof value !== 'object') return []
  return [value, ...nodes(value.props?.children)]
}
function text(value) {
  if (Array.isArray(value)) return value.map(text).join(' ')
  if (value == null || typeof value === 'boolean') return ''
  return typeof value === 'object' ? text(value.props?.children) : String(value)
}
function render(props) {
  harness.cursor = 0
  return MasterDashboardStats(props)
}
const commerceNodes = (tree) => nodes(tree).filter((n) =>
  typeof n.props?.onClick === 'function' && /Продлить|Апгрейд|Обновите подписку/.test(text(n)))

beforeEach(() => {
  harness.states = []; harness.cursor = 0; harness.ios = false
  vi.clearAllMocks()
})

describe('dashboard commerce surfaces and handlers', () => {
  for (const plan of ['Free', 'Premium', 'AlwaysFree']) {
    it.each(['demo', 'ordinary', 'ios_app'])('%s / ' + plan, (session) => {
      harness.ios = session === 'ios_app'
      const props = {
        isDemoMode: session === 'demo',
        hasExtendedStats: plan !== 'Free',
        subscriptionStatus: { plan_name: plan, days_remaining: 7 },
        balance: { balance: 0 },
        // Even a stale callback must not be reachable in a restricted session.
        onOpenSubscriptionModal: harness.purchase,
        onOpenTariff: harness.tariff,
      }
      let tree = render(props)
      const expand = nodes(tree).find((n) =>
        n.type === 'button' && /Статистика за неделю/.test(text(n)))
      expect(expand).toBeDefined()
      expand.props.onClick()
      tree = render(props)
      if (session === 'ordinary') {
        const renew = nodes(tree).find((n) => n.type === 'button' && text(n).trim() === 'Продлить →')
        expect(renew).toBeDefined()
        renew.props.onClick()
        expect(harness.purchase).toHaveBeenCalledOnce()
        expect(commerceNodes(tree).length).toBeGreaterThan(0)
      } else {
        expect(commerceNodes(tree)).toEqual([])
        expect(text(tree)).not.toMatch(/Продлить|Апгрейд|Обновите подписку/)
        expect(harness.purchase).not.toHaveBeenCalled()
        expect(harness.post).not.toHaveBeenCalled()
        expect(harness.put).not.toHaveBeenCalled()
      }
      if (session === 'demo') {
        const info = nodes(tree).find((n) => n.type === 'button' && text(n).trim() === 'Тарифы')
        expect(info).toBeDefined()
        info.props.onClick()
        expect(harness.tariff).toHaveBeenCalledOnce()
        expect(harness.purchase).not.toHaveBeenCalled()
      }
    })
  }
})

// Evaluate the actual parent's JSX callback/mount expressions, including an
// already-open modal state. This checks wiring, not just absent UI strings.
const source = readFileSync(new URL('../pages/MasterDashboard.jsx', import.meta.url), 'utf8')
const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] })
function astNodes(value) {
  if (Array.isArray(value)) return value.flatMap(astNodes)
  if (!value || typeof value !== 'object') return []
  return [value, ...Object.entries(value).filter(([k]) => k !== 'loc').flatMap(([, v]) => astNodes(v))]
}
const all = astNodes(ast)
const purchaseInit = all.find((n) => n.type === 'VariableDeclarator' && n.id.name === 'canPurchaseSubscription').init
const callbacks = all.filter((n) => n.type === 'JSXAttribute' && n.name.name === 'onOpenSubscriptionModal'
  && n.value?.expression?.type === 'ConditionalExpression' && n.value.expression.test.name === 'canPurchaseSubscription')
const modal = all.find((n) => n.type === 'LogicalExpression' && n.operator === '&&'
  && n.right.type === 'JSXElement' && n.right.openingElement.name.name === 'SubscriptionModal')
const statsElement = all.find((n) => n.type === 'JSXOpeningElement' && n.name.name === 'MasterDashboardStats')
const evaluate = (node, values) => Function(...Object.keys(values),
  'return (' + source.slice(node.start, node.end) + ')')(...Object.values(values))

it.each(['demo', 'ordinary', 'ios_app'])('parent callback and modal boundary: %s', (session) => {
  const values = {
    isIosAppWebSession: session === 'ios_app', isDemoMode: session === 'demo',
    showSubscriptionModal: true, setShowSubscriptionModal: vi.fn(),
  }
  values.canPurchaseSubscription = evaluate(purchaseInit, values)
  const demoProp = statsElement.attributes.find((n) => n.name?.name === 'isDemoMode')
  expect(evaluate(demoProp.value.expression, values)).toBe(session === 'demo')
  expect(callbacks).toHaveLength(2)
  for (const attribute of callbacks) {
    const handler = evaluate(attribute.value.expression, values)
    if (session === 'ordinary') {
      expect(typeof handler).toBe('function')
      handler()
    } else {
      expect(handler == null).toBe(true)
    }
  }
  expect(Boolean(evaluate(modal.left, values))).toBe(session === 'ordinary')
  expect(values.setShowSubscriptionModal).toHaveBeenCalledTimes(session === 'ordinary' ? 2 : 0)
  expect(harness.post).not.toHaveBeenCalled()
  expect(harness.put).not.toHaveBeenCalled()
})
