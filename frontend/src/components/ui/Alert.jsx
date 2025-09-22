import React from 'react'
import { createAlertStyle } from '../../utils/designTokens'

const Alert = ({ 
  children, 
  variant = 'info', 
  className = '', 
  ...props 
}) => {
  const alertStyle = createAlertStyle(variant)
  
  return (
    <div className={`${alertStyle} ${className}`} {...props}>
      {children}
    </div>
  )
}

export default Alert 