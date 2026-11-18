import { act } from 'react'
import { createRoot } from 'react-dom/client'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

function installViewport(matchLg) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query) => ({
      matches: query === '(min-width: 1024px)' ? matchLg : false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

export function installLgViewport() {
  installViewport(true)
}

export function installMobileViewport() {
  installViewport(false)
}

export function mountDom(ui) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  return {
    container,
    async render(tree) {
      await act(async () => {
        root.render(tree)
        await Promise.resolve()
      })
    },
    async unmount() {
      await act(async () => {
        root.unmount()
      })
      container.remove()
    },
    click(textOrSelector) {
      const node = typeof textOrSelector === 'string'
        ? [...container.querySelectorAll('button, [role="tab"]')].find((el) => el.textContent?.includes(textOrSelector))
        : container.querySelector(textOrSelector)
      if (!node) throw new Error(`click target not found: ${textOrSelector}`)
      return act(async () => {
        node.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        await Promise.resolve()
      })
    },
  }
}