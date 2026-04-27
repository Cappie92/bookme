import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { metrikaInitOnce, metrikaPageView } from './metrika'

/**
 * Init один раз, при смене маршрута — виртуальный pageview (hit).
 */
export default function MetrikaRouteListener() {
  const location = useLocation()
  const prevKey = useRef('')

  useEffect(() => {
    const key = `${location.pathname}${location.search || ''}${location.hash || ''}`
    if (prevKey.current === key) {
      return
    }
    prevKey.current = key
    void metrikaInitOnce().then(() => {
      metrikaPageView()
    })
  }, [location.pathname, location.search, location.hash])

  return null
}
