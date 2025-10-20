import React, { useState, useEffect } from 'react';
import { 
  CheckCircleIcon, 
  ExclamationTriangleIcon, 
  InformationCircleIcon,
  PresentationChartBarIcon,
  EyeIcon,
  ClockIcon,
  DocumentTextIcon
} from '@heroicons/react/24/outline';

const SEOAnalyzer = ({ title, content, metaDescription, excerpt }) => {
  const [seoScore, setSeoScore] = useState(0);
  const [suggestions, setSuggestions] = useState([]);
  const [wordCount, setWordCount] = useState(0);
  const [readingTime, setReadingTime] = useState(0);

  useEffect(() => {
    analyzeSEO();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, content, metaDescription, excerpt]);

  const analyzeSEO = () => {
    let score = 0;
    const newSuggestions = [];

    // Анализ заголовка
    if (title) {
      if (title.length >= 30 && title.length <= 60) {
        score += 20;
        newSuggestions.push({
          type: 'success',
          message: 'Заголовок оптимальной длины (30-60 символов)',
          icon: CheckCircleIcon
        });
      } else {
        newSuggestions.push({
          type: 'warning',
          message: `Заголовок должен быть 30-60 символов (сейчас ${title.length})`,
          icon: ExclamationTriangleIcon
        });
      }
    } else {
      newSuggestions.push({
        type: 'error',
        message: 'Заголовок обязателен для SEO',
        icon: ExclamationTriangleIcon
      });
    }

    // Анализ описания
    if (metaDescription || excerpt) {
      const desc = metaDescription || excerpt;
      if (desc.length >= 120 && desc.length <= 160) {
        score += 15;
        newSuggestions.push({
          type: 'success',
          message: 'Meta description оптимальной длины (120-160 символов)',
          icon: CheckCircleIcon
        });
      } else {
        newSuggestions.push({
          type: 'warning',
          message: `Meta description должен быть 120-160 символов (сейчас ${desc.length})`,
          icon: ExclamationTriangleIcon
        });
      }
    } else {
      newSuggestions.push({
        type: 'warning',
        message: 'Добавьте meta description для лучшего SEO',
        icon: InformationCircleIcon
      });
    }

    // Анализ контента
    if (content) {
      // Подсчет слов
      const words = content.replace(/<[^>]*>/g, '').split(/\s+/).filter(word => word.length > 0);
      const count = words.length;
      setWordCount(count);

      // Время чтения (200 слов в минуту)
      const time = Math.max(1, Math.ceil(count / 200));
      setReadingTime(time);

      if (count >= 300) {
        score += 25;
        newSuggestions.push({
          type: 'success',
          message: `Контент содержит достаточно слов (${count} слов)`,
          icon: CheckCircleIcon
        });
      } else {
        newSuggestions.push({
          type: 'warning',
          message: `Контент должен содержать минимум 300 слов (сейчас ${count})`,
          icon: ExclamationTriangleIcon
        });
      }

      // Проверка подзаголовков
      const headings = (content.match(/<h[2-6][^>]*>/g) || []).length;
      if (headings > 0) {
        score += 15;
        newSuggestions.push({
          type: 'success',
          message: `Найдено подзаголовков: ${headings}`,
          icon: CheckCircleIcon
        });
      } else {
        newSuggestions.push({
          type: 'warning',
          message: 'Добавьте подзаголовки (H2-H6) для лучшей структуры',
          icon: ExclamationTriangleIcon
        });
      }

      // Проверка изображений с alt
      const imagesWithAlt = (content.match(/<img[^>]*alt=["'][^"']+["'][^>]*>/g) || []).length;
      const totalImages = (content.match(/<img[^>]*>/g) || []).length;
      
      if (totalImages > 0) {
        if (imagesWithAlt === totalImages) {
          score += 10;
          newSuggestions.push({
            type: 'success',
            message: `Все изображения имеют alt-атрибуты (${totalImages})`,
            icon: CheckCircleIcon
          });
        } else {
          newSuggestions.push({
            type: 'warning',
            message: `Добавьте alt-атрибуты к изображениям (${imagesWithAlt}/${totalImages})`,
            icon: ExclamationTriangleIcon
          });
        }
      }

      // Проверка внутренних ссылок
      const internalLinks = (content.match(/href=["']\/[^"']+["']/g) || []).length;
      if (internalLinks > 0) {
        score += 10;
        newSuggestions.push({
          type: 'success',
          message: `Найдено внутренних ссылок: ${internalLinks}`,
          icon: CheckCircleIcon
        });
      } else {
        newSuggestions.push({
          type: 'info',
          message: 'Добавьте внутренние ссылки для лучшего SEO',
          icon: InformationCircleIcon
        });
      }

      // Проверка внешних ссылок
      const externalLinks = (content.match(/href=["']https?:\/\/[^"']+["']/g) || []).length;
      if (externalLinks > 0) {
        score += 5;
        newSuggestions.push({
          type: 'success',
          message: `Найдено внешних ссылок: ${externalLinks}`,
          icon: CheckCircleIcon
        });
      }
    }

    setSeoScore(Math.min(100, score));
    setSuggestions(newSuggestions);
  };

  const getScoreColor = (score) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreBgColor = (score) => {
    if (score >= 80) return 'bg-green-100';
    if (score >= 60) return 'bg-yellow-100';
    return 'bg-red-100';
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-4">
          <PresentationChartBarIcon className="h-5 w-5 text-blue-600" />
          <h3 className="text-lg font-medium text-gray-900">SEO Анализ</h3>
        </div>

      {/* SEO Score */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">SEO Оценка</span>
          <span className={`text-lg font-bold ${getScoreColor(seoScore)}`}>
            {seoScore}/100
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div 
            className={`h-3 rounded-full transition-all duration-300 ${getScoreBgColor(seoScore)}`}
            style={{ width: `${seoScore}%` }}
          ></div>
        </div>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="text-center">
          <div className="flex items-center justify-center mb-1">
            <DocumentTextIcon className="h-4 w-4 text-blue-600" />
          </div>
          <div className="text-lg font-semibold text-gray-900">{wordCount}</div>
          <div className="text-xs text-gray-500">Слов</div>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center mb-1">
            <ClockIcon className="h-4 w-4 text-green-600" />
          </div>
          <div className="text-lg font-semibold text-gray-900">{readingTime}</div>
          <div className="text-xs text-gray-500">Мин чтения</div>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center mb-1">
            <EyeIcon className="h-4 w-4 text-purple-600" />
          </div>
          <div className="text-lg font-semibold text-gray-900">{suggestions.length}</div>
          <div className="text-xs text-gray-500">Рекомендаций</div>
        </div>
      </div>

      {/* Рекомендации */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-3">Рекомендации</h4>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {suggestions.map((suggestion, index) => {
            const Icon = suggestion.icon;
            return (
              <div 
                key={index}
                className={`flex items-start gap-2 p-2 rounded-lg ${
                  suggestion.type === 'success' ? 'bg-green-50 border border-green-200' :
                  suggestion.type === 'warning' ? 'bg-yellow-50 border border-yellow-200' :
                  suggestion.type === 'error' ? 'bg-red-50 border border-red-200' :
                  'bg-blue-50 border border-blue-200'
                }`}
              >
                <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${
                  suggestion.type === 'success' ? 'text-green-600' :
                  suggestion.type === 'warning' ? 'text-yellow-600' :
                  suggestion.type === 'error' ? 'text-red-600' :
                  'text-blue-600'
                }`} />
                <span className="text-sm text-gray-700">{suggestion.message}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default SEOAnalyzer; 