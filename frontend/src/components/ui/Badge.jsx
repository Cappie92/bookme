import React from 'react'
import { createBadgeStyle } from '../../utils/designTokens'

const Badge = ({ 
  children, 
  variant = 'neutral', 
  className = '', 
  ...props 
}) => {
  const badgeStyle = createBadgeStyle(variant)
  
  return (
    <span className={`${badgeStyle} ${className}`} {...props}>
      {children}
    </span>
  )
}

export default Badge 