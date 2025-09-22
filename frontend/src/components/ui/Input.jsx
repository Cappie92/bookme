import React from 'react'

const Input = ({ 
  value, 
  onChange, 
  placeholder, 
  type = 'text', 
  hasError = false, 
  className = '', 
  label,
  readOnly = false,
  ...props 
}) => {
  const baseClasses = 'w-full px-3 py-2 border rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2'
  
  const variants = {
    default: 'border-neutral-300 bg-white text-neutral-900 placeholder-neutral-500 focus:border-primary-500 focus:ring-primary-500',
    error: 'border-error-300 bg-white text-neutral-900 placeholder-neutral-500 focus:border-error-500 focus:ring-error-500'
  }
  
  const inputClass = hasError ? variants.error : variants.default
  
  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-sm font-medium text-neutral-700">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          readOnly={readOnly}
          className={`${baseClasses} ${inputClass} ${className}`}
          {...props}
        />
      </div>
    </div>
  )
}

export default Input 