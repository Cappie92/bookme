import React from 'react'
import { createCardStyle } from '../../utils/designTokens'

const Card = ({ 
  children, 
  variant = 'default', 
  className = '', 
  ...props 
}) => {
  const cardStyle = createCardStyle(variant)
  
  return (
    <div className={`${cardStyle} ${className}`} {...props}>
      {children}
    </div>
  )
}

export default Card 