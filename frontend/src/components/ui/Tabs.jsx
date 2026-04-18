const SEGMENTED_BTN_ACTIVE = 'bg-white text-[#4CAF50] shadow-sm'
const SEGMENTED_BTN_INACTIVE = 'text-gray-700 hover:text-gray-900'

/**
 * @param {{ tabs: Array<{ value?: string, id?: string, label: string }>, activeTab: string, onTabChange: (v: string) => void, variant?: 'underline' | 'segmented', segmentedCompact?: boolean }} props
 */
const Tabs = ({ tabs, activeTab, onTabChange, variant = 'underline', segmentedCompact = false }) => {
  if (variant === 'segmented') {
    const wrapClass = segmentedCompact
      ? 'inline-flex bg-gray-100 rounded-md p-0.5 gap-0.5'
      : 'inline-flex bg-gray-100 rounded-lg p-1'
    const btnClass = segmentedCompact
      ? 'px-3 py-1.5 rounded-[5px] text-sm font-medium transition-colors leading-tight'
      : 'px-4 py-2 rounded-md text-sm font-medium transition-colors'
    return (
      <div className={wrapClass}>
        {tabs.map((tab, index) => {
          const value = tab.value || tab.id
          const isActive = activeTab === value
          return (
            <button
              key={tab.id || tab.value || index}
              type="button"
              onClick={() => onTabChange(value)}
              className={`${btnClass} ${
                isActive ? SEGMENTED_BTN_ACTIVE : SEGMENTED_BTN_INACTIVE
              }`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div className="border-b border-gray-200">
      <nav className="-mb-px flex space-x-8">
        {tabs.map((tab, index) => (
          <button
            key={tab.id || tab.value || index}
            type="button"
            onClick={() => onTabChange(tab.value || tab.id)}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === (tab.value || tab.id)
                ? 'border-[#4CAF50] text-[#4CAF50]'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  )
}

export default Tabs
