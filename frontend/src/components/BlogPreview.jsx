import React from 'react';
import { XMarkIcon, EyeIcon, PresentationChartBarIcon } from '@heroicons/react/24/outline';
import SEOAnalyzer from './SEOAnalyzer';

const BlogPreview = ({ post, onClose, seoAnalysis }) => {
  const formatDate = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-6xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <EyeIcon className="h-5 w-5 text-blue-600" />
              <h2 className="text-xl font-bold text-gray-900">Предварительный просмотр</h2>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Основной контент */}
            <div className="lg:col-span-2">
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                {/* Заголовок */}
                <div className="p-6 border-b border-gray-200">
                  <h1 className="text-3xl font-bold text-gray-900 mb-2">
                    {post.title}
                  </h1>
                  {post.subtitle && (
                    <p className="text-lg text-gray-600 mb-4">{post.subtitle}</p>
                  )}
                  
                  {/* Мета-информация */}
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <span>Автор: {post.author_name || 'Неизвестный автор'}</span>
                    <span>•</span>
                    <span>Создано: {formatDate(post.created_at)}</span>
                    {post.published_at && (
                      <>
                        <span>•</span>
                        <span>Опубликовано: {formatDate(post.published_at)}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Обложка */}
                {post.cover_image && (
                  <div className="p-6 border-b border-gray-200">
                    <img
                      src={post.cover_image}
                      alt={post.cover_image_alt || post.title}
                      className="w-full h-64 object-cover rounded-lg"
                    />
                  </div>
                )}

                {/* Контент */}
                <div className="p-6">
                  <div 
                    className="prose max-w-none"
                    dangerouslySetInnerHTML={{ __html: post.content }}
                  />
                </div>

                {/* Теги */}
                {post.tags && post.tags.length > 0 && (
                  <div className="p-6 border-t border-gray-200">
                    <div className="flex flex-wrap gap-2">
                      {post.tags.map((tag, index) => (
                        <span
                          key={index}
                          className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Боковая панель с SEO */}
            <div className="space-y-6">
              {/* SEO Анализ */}
              <SEOAnalyzer
                title={post.title}
                content={post.content}
                metaDescription={post.meta_description}
                excerpt={post.excerpt}
              />

              {/* Meta теги */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-center gap-2 mb-4">
                  <PresentationChartBarIcon className="h-5 w-5 text-green-600" />
                  <h3 className="text-lg font-medium text-gray-900">Meta теги</h3>
                </div>
                
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Title
                    </label>
                    <div className="text-sm text-gray-900 bg-gray-50 p-2 rounded">
                      {post.meta_title || post.title}
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Description
                    </label>
                    <div className="text-sm text-gray-900 bg-gray-50 p-2 rounded">
                      {post.meta_description || post.excerpt || 'Не указано'}
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Canonical URL
                    </label>
                    <div className="text-sm text-gray-900 bg-gray-50 p-2 rounded">
                      {post.canonical_url || `https://appointo.ru/blog/${post.slug}`}
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Robots
                    </label>
                    <div className="text-sm text-gray-900 bg-gray-50 p-2 rounded">
                      {post.robots_noindex ? 'noindex' : 'index'}, {post.robots_nofollow ? 'nofollow' : 'follow'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Open Graph */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Open Graph</h3>
                
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      og:title
                    </label>
                    <div className="text-sm text-gray-900 bg-gray-50 p-2 rounded">
                      {post.og_title || post.title}
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      og:description
                    </label>
                    <div className="text-sm text-gray-900 bg-gray-50 p-2 rounded">
                      {post.og_description || post.excerpt || 'Не указано'}
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      og:image
                    </label>
                    <div className="text-sm text-gray-900 bg-gray-50 p-2 rounded">
                      {post.og_image || post.cover_image || 'Не указано'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Twitter Cards */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Twitter Cards</h3>
                
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      twitter:title
                    </label>
                    <div className="text-sm text-gray-900 bg-gray-50 p-2 rounded">
                      {post.twitter_title || post.title}
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      twitter:description
                    </label>
                    <div className="text-sm text-gray-900 bg-gray-50 p-2 rounded">
                      {post.twitter_description || post.excerpt || 'Не указано'}
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      twitter:image
                    </label>
                    <div className="text-sm text-gray-900 bg-gray-50 p-2 rounded">
                      {post.twitter_image || post.cover_image || 'Не указано'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Статистика */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Статистика</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {post.word_count || 0}
                    </div>
                    <div className="text-xs text-gray-500">Слов</div>
                  </div>
                  
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {post.reading_time || 0}
                    </div>
                    <div className="text-xs text-gray-500">Мин чтения</div>
                  </div>
                  
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">
                      {post.seo_score || 0}%
                    </div>
                    <div className="text-xs text-gray-500">SEO оценка</div>
                  </div>
                  
                  <div className="text-center">
                    <div className="text-2xl font-bold text-orange-600">
                      {post.tags?.length || 0}
                    </div>
                    <div className="text-xs text-gray-500">Тегов</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BlogPreview; 