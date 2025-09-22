import React from 'react'

const Radio = ({ 
  checked = false, 
  onChange, 
  label, 
  name,
  value,
  className = '', 
  disabled = false,
  ...props 
}) => {
  const baseClasses = 'flex items-center space-x-2'
  const radioClasses = `
    w-4 h-4 rounded-full border-2 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2
    ${checked 
      ? 'border-primary-500 focus:ring-primary-500' 
      : 'border-neutral-300 focus:ring-primary-500'
    }
    ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
  `
  
  return (
    <label className={`${baseClasses} ${className} ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        name={name}
        value={value}
        disabled={disabled}
        className="sr-only"
        {...props}
      />
      <div className={`${radioClasses} flex items-center justify-center`}>
        {checked && (
          <div className="w-1.5 h-1.5 bg-primary-500 rounded-full"></div>
        )}
      </div>
      {label && (
        <span className={`text-sm ${disabled ? 'text-neutral-500' : 'text-neutral-700'}`}>
          {label}
        </span>
      )}
    </label>
  )
}

export default Radio 