import { useState } from 'react'

export default function Tooltip({
  children,
  text,
  content,
  position = 'top',
  compact = false,
  maxWidthClass = 'max-w-xs',
}) {
  const [isVisible, setIsVisible] = useState(false)

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2'
  }

  const arrowClasses = {
    top: 'top-full left-1/2 -translate-x-1/2 border-t-gray-800 border-l-transparent border-r-transparent border-b-transparent',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-gray-800 border-l-transparent border-r-transparent border-t-transparent',
    left: 'left-full top-1/2 -translate-y-1/2 border-l-gray-800 border-t-transparent border-b-transparent border-r-transparent',
    right: 'right-full top-1/2 -translate-y-1/2 border-r-gray-800 border-t-transparent border-b-transparent border-l-transparent'
  }

  // Если передан content (JSX), используем его, иначе используем text
  const tooltipContent = content || text

  return (
    <div
      className={compact ? 'relative inline-flex shrink-0' : 'relative inline-block w-full'}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      {isVisible && tooltipContent && (
        <div
          className={`absolute z-50 ${positionClasses[position]} pointer-events-none`}
        >
          <div
            className={`bg-gray-800 text-white text-xs rounded py-1.5 px-2.5 shadow-lg ${
              content ? `whitespace-normal ${maxWidthClass}` : 'whitespace-nowrap'
            }`}
          >
            {tooltipContent}
            <div
              className={`absolute w-0 h-0 border-4 ${arrowClasses[position]}`}
            />
          </div>
        </div>
      )}
    </div>
  )
}

