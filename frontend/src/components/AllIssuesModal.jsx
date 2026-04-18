import React from 'react';
import { ChevronRightIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useModal } from '../hooks/useModal';

export default function AllIssuesModal({ isOpen, onClose, issues, onIssueClick }) {
  const { handleBackdropClick, handleMouseDown } = useModal(onClose);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" 
      onClick={handleBackdropClick}
      onMouseDown={handleMouseDown}
    >
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
        {/* Заголовок */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Требует внимания</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            aria-label="Закрыть"
          >
            <XMarkIcon className="h-6 w-6" strokeWidth={2} aria-hidden />
          </button>
        </div>

        {/* Контент */}
        <div className="flex-1 overflow-y-auto p-6">
          {issues.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">Все в порядке</p>
            </div>
          ) : (
            <div className="space-y-3">
              {issues.map((issue, index) => (
                <button
                  type="button"
                  key={index}
                  onClick={() => {
                    if (onIssueClick) {
                      onIssueClick(issue);
                    }
                    onClose();
                  }}
                  className="w-full text-left p-4 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-blue-300 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-gray-900 font-medium">{issue.message}</span>
                    <ChevronRightIcon className="h-5 w-5 shrink-0 text-blue-600" strokeWidth={2} aria-hidden />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

