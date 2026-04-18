import React, { useState } from 'react'

const ColorPicker = ({ value, onChange, label }) => {
  const [showPalette, setShowPalette] = useState(false)

  // Палитра цветов (как на Flaticon)
  const colorPalette = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
    '#F8C471', '#82E0AA', '#F1948A', '#85C1E9', '#D7BDE2',
    '#F9E79F', '#A9CCE3', '#FAD7A0', '#D5A6BD', '#A3E4D7',
    '#F8C471', '#82E0AA', '#F1948A', '#85C1E9', '#D7BDE2',
    '#F9E79F', '#A9CCE3', '#FAD7A0', '#D5A6BD', '#A3E4D7',
    '#E8F8F5', '#FEF9E7', '#FDF2F8', '#F0F8FF', '#F0FFF0',
    '#FFF8DC', '#F5F5DC', '#F0F8FF', '#F8F8FF', '#F5F5F5'
  ]

  const handleColorSelect = (color) => {
    onChange(color)
    setShowPalette(false)
  }

  const handleInputChange = (e) => {
    const value = e.target.value
    if (value.match(/^#[0-9A-Fa-f]{6}$/)) {
      onChange(value)
    }
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium mb-1">{label}</label>
      <div className="flex items-center space-x-3">
        <div className="relative">
          <div
            className="w-12 h-12 rounded-lg border-2 border-gray-300 cursor-pointer"
            style={{ backgroundColor: value || '#ffffff' }}
            onClick={() => setShowPalette(!showPalette)}
          />
          {showPalette && (
            <div className="absolute top-full left-0 mt-2 p-3 bg-white border border-gray-300 rounded-lg shadow-lg z-10">
              <div className="grid grid-cols-8 gap-2 max-w-64">
                {colorPalette.map((color, index) => (
                  <div
                    key={index}
                    className="w-8 h-8 rounded cursor-pointer border border-gray-300 hover:scale-110 transition-transform"
                    style={{ backgroundColor: color }}
                    onClick={() => handleColorSelect(color)}
                    title={color}
                  />
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-gray-200">
                <input
                  type="text"
                  placeholder="#FFFFFF"
                  value={value || ''}
                  onChange={handleInputChange}
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                />
              </div>
            </div>
          )}
        </div>
        <input
          type="text"
          value={value || ''}
          onChange={handleInputChange}
          placeholder="#FFFFFF"
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
      {showPalette && (
        <div 
          className="fixed inset-0 z-0" 
          onClick={() => setShowPalette(false)}
        />
      )}
    </div>
  )
}

export default ColorPicker 