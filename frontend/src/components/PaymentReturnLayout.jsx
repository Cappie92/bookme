import React from 'react'
import Header from './Header'

const ctaClassName =
  'bg-[#4CAF50] hover:bg-[#43A047] text-white font-semibold py-3 px-8 rounded-lg transition-colors w-full max-w-sm'

const secondaryLinkClassName =
  'text-[#4CAF50] hover:text-[#43A047] font-medium w-full max-w-sm text-center'

export function PaymentReturnLayout({ children, media, testId }) {
  return (
    <div
      className="min-h-screen bg-[#F9F7F6] flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
      data-testid={testId}
    >
      <div className="hidden lg:block">
        <Header />
      </div>
      <div className="flex-grow flex items-center justify-center px-4 sm:px-6 py-6 lg:py-4">
        <div className="w-full max-w-6xl">
          <div className="flex flex-col lg:flex-row items-center justify-center gap-6 lg:gap-8">
            <div className="w-full lg:w-1/2 flex justify-center max-w-[7rem] sm:max-w-[9rem] lg:max-w-md flex-shrink-0">
              {media}
            </div>
            <div className="w-full lg:w-1/2 flex flex-col items-center lg:items-start text-center lg:text-left min-w-0">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export { ctaClassName, secondaryLinkClassName }
