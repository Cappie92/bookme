import { useLayoutEffect } from 'react'
import { lockMasterBodyScroll, unlockMasterBodyScroll } from '../utils/masterBodyScrollLock'

/**
 * Блокирует скролл document.body пока active === true.
 */
export function useMasterOverlayScrollLock(active) {
  useLayoutEffect(() => {
    if (!active) return undefined
    lockMasterBodyScroll()
    return () => {
      unlockMasterBodyScroll()
    }
  }, [active])
}
