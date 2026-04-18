import React from 'react'

const Button = ({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  disabled = false, 
  className = '', 
  onClick, 
  type = 'button',
  ...props 
}) => {
  const baseClasses = 'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2'
  
  const variants = {
    primary:
      'bg-sem-action-primary text-sem-fg-onPrimary hover:bg-sem-action-primaryHover focus:ring-sem-focus-ring shadow-sm',
    secondary:
      'bg-sem-action-secondary text-sem-fg-primary border border-neutral-300 hover:bg-neutral-50 focus:ring-sem-focus-ring',
    disabled: 'bg-neutral-200 text-neutral-500 cursor-not-allowed',
    hover:
      'bg-sem-surface-controlMuted text-sem-fg-primary hover:bg-sem-surface-controlMutedHover focus:ring-sem-focus-ring',
  }
  
  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base'
  }
  
  const variantClass = disabled ? variants.disabled : variants[variant] || variants.primary
  const sizeClass = sizes[size] || sizes.md
  
  return (
    <button
      type={type}
      className={`${baseClasses} ${variantClass} ${sizeClass} ${className}`}
      onClick={onClick}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  )
}

export default Button 