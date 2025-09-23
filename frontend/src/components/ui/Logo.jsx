import React from 'react'

const Logo = ({ 
  size = 'md', 
  className = '', 
  showText = false, // Оставляем для обратной совместимости, но не используем
  ...props 
}) => {
  const sizes = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
    '2xl': 'w-20 h-20',
    '3xl': 'w-25 h-25'
  }
  
  return (
    <div className={`flex items-center ${className}`} {...props}>
      {/* Логотип из изображения */}
      <div className={`${sizes[size]} flex-shrink-0`}>
        <img 
          src="/dedato_trnsp.png" 
          alt="Dedato" 
          className="w-full h-full object-contain"
        />
      </div>
    </div>
  )
}

export default Logo 