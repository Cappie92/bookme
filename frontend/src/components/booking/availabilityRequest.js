import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/** Идентичность логического запроса: мастер, услуга, окно дат. */
export function publicAvailabilityIdentity({ slug, serviceId, from, to }) {
  if (!slug || serviceId == null || serviceId === '') return ''
  return `${slug}:${serviceId}:${from}:${to}`
}

/** Следующий запрос отменяет предыдущий, даже если тот уже получил ответ. */
export function startAvailabilityRequest(store) {
  const ticket = (store.current || 0) + 1
  store.current = ticket
  return {
    ticket,
    isCurrent() {
      return store.current === ticket
    },
    invalidate() {
      if (store.current === ticket) store.current = ticket + 1
    },
  }
}

let commitListener = null

export const AVAILABILITY_LOAD_ERROR = 'Не удалось загрузить свободные слоты. Проверьте интернет и попробуйте ещё раз.'

/** Слушатель layout-фазы: видит commit до passive effect. В проде не задан. */
export function onAvailabilityCommit(listener) {
  commitListener = listener
  return () => {
    if (commitListener === listener) commitListener = null
  }
}

/**
 * Слоты, ошибка и loading видны только вместе с identity, которой они получены.
 * Смена identity скрывает прежний результат в том же render, до passive effect.
 */
export function visibleAvailability(snapshot, { enabled, identityKey }) {
  if (!enabled || !identityKey || !snapshot || snapshot.identityKey !== identityKey) {
    return {
      slots: [],
      error: null,
      loading: Boolean(enabled && identityKey),
    }
  }
  if (snapshot.status === 'ready') {
    return { slots: snapshot.slots, error: null, loading: false }
  }
  if (snapshot.status === 'error') {
    return { slots: [], error: snapshot.error, loading: false }
  }
  return { slots: [], error: null, loading: true }
}

/**
 * Один логический запрос на identityKey.
 * Устаревший успех, ошибка и finally не трогают состояние нового запроса.
 * Пока ответ не записан с той же identity, render показывает pending.
 */
export function useGuardedAvailability({ enabled, identityKey, fetcher }) {
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher
  const store = useRef(0)
  const [snapshot, setSnapshot] = useState({
    identityKey: '',
    slots: [],
    error: null,
    status: 'idle',
  })

  useEffect(() => {
    if (!enabled || !identityKey) {
      store.current += 1
      return undefined
    }
    const request = startAvailabilityRequest(store)
    const key = identityKey
    setSnapshot({
      identityKey: key,
      slots: [],
      error: null,
      status: 'loading',
    })
    fetcherRef.current().then(
      (nextSlots) => {
        if (!request.isCurrent()) return
        setSnapshot({
          identityKey: key,
          slots: Array.isArray(nextSlots) ? nextSlots : [],
          error: null,
          status: 'ready',
        })
      },
      () => {
        if (!request.isCurrent()) return
        setSnapshot({
          identityKey: key,
          slots: [],
          error: AVAILABILITY_LOAD_ERROR,
          status: 'error',
        })
      },
    )
    return () => {
      request.invalidate()
    }
  }, [enabled, identityKey])

  const visible = visibleAvailability(snapshot, { enabled, identityKey })
  useLayoutEffect(() => {
    commitListener?.(visible)
  })
  return visible
}
