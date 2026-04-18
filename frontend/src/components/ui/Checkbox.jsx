import React from 'react'

const Checkbox = ({ 
  checked = false, 
  onChange, 
  label, 
  className = '', 
  disabled = false,
  ...props 
}) => {
  const baseClasses = 'flex items-center space-x-2'
  const checkboxClasses = `
    w-4 h-4 rounded border-2 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2
    ${checked 
      ? 'bg-primary-500 border-primary-500 focus:ring-primary-500' 
      : 'bg-white border-neutral-300 focus:ring-primary-500'
    }
    ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
  `
  
  return (
    <label className={`${baseClasses} ${className} ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="sr-only"
        {...props}
      />
      <div className={checkboxClasses}>
        {checked && (
          <img 
            src="/Логотип dedato - Яркий зеленый_прозрачный_big.png" 
            alt="Dedato" 
            className="w-3 h-3 object-contain"
          />
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

export default Checkbox 