import React from 'react'

const ServiceCard = ({ 
  title, 
  duration, 
  price, 
  icon, 
  className = '', 
  ...props 
}) => {
  return (
    <div className={`bg-white rounded-lg shadow-sm border border-neutral-200 p-4 ${className}`} {...props}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-16 h-16 bg-[#E8F5E8] rounded-lg flex items-center justify-center">
            {icon ? (
              <div className="w-8 h-8 text-[#4CAF50]">{icon}</div>
            ) : (
              <svg className="w-8 h-8 text-[#4CAF50]" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </div>
          <div className="flex flex-col justify-center">
            <h3 className="text-sm font-medium text-neutral-900">{title}</h3>
            <p className="text-xs text-neutral-600">{duration}</p>
          </div>
        </div>
        <div className="flex items-center justify-center">
          <span className="text-lg font-semibold text-neutral-900">{price} ₽</span>
        </div>
      </div>
    </div>
  )
}

export default ServiceCard 