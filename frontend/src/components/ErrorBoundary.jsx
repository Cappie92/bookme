import React from 'react'

/**
 * ErrorBoundary перехватывает ошибки в дочерних компонентах и рендерит fallback.
 * Используется для изоляции падений (например, в платежном модуле), чтобы остальная страница работала.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }
      return (
        <div
          data-testid={this.props.fallbackTestId || 'public-error'}
          className="p-4 bg-amber-50 border border-amber-200 rounded-lg"
        >
          <p className="text-amber-800 text-sm">
            {this.props.message || 'Произошла ошибка при загрузке этого блока.'}
          </p>
        </div>
      )
    }
    return this.props.children
  }
}
