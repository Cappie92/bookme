/**
 * Счётчик блокировки скролла body для мастерского кабинета (mobile web).
 * Несколько открытых оверлеев не затирают друг друга при снятии lock.
 */
let lockDepth = 0
let savedOverflow = ''

export function lockMasterBodyScroll() {
  if (lockDepth === 0) {
    savedOverflow = document.body.style.overflow || ''
    document.body.style.overflow = 'hidden'
  }
  lockDepth += 1
}

export function unlockMasterBodyScroll() {
  if (lockDepth === 0) return
  lockDepth -= 1
  if (lockDepth === 0) {
    document.body.style.overflow = savedOverflow
  }
}
