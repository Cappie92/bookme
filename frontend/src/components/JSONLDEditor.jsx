import React, { useState, useEffect } from 'react';
import { CodeBracketIcon, EyeIcon, PencilIcon } from '@heroicons/react/24/outline';

const JSONLDEditor = ({ jsonLd, onChange, postData }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [jsonContent, setJsonContent] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (jsonLd) {
      try {
        setJsonContent(JSON.stringify(jsonLd, null, 2));
      } catch (err) {
        console.error('Error stringifying JSON-LD:', err);
        setJsonContent('{}');
      }
    } else {
      // Генерируем базовый JSON-LD
      const baseJsonLd = {
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": postData?.title || "",
        "description": postData?.excerpt || postData?.meta_description || "",
        "image": postData?.cover_image || "",
        "author": {
          "@type": "Person",
          "name": postData?.author_name || "Автор"
        },
        "publisher": {
          "@type": "Organization",
          "name": "Appointo",
          "logo": {
            "@type": "ImageObject",
            "url": "https://appointo.ru/logo.png"
          }
        },
        "datePublished": postData?.published_at || new Date().toISOString(),
        "dateModified": postData?.updated_at || new Date().toISOString(),
        "mainEntityOfPage": {
          "@type": "WebPage",
          "@id": `https://appointo.ru/blog/${postData?.slug || ""}`
        }
      };
      setJsonContent(JSON.stringify(baseJsonLd, null, 2));
    }
  }, [jsonLd, postData]);

  const handleSave = () => {
    try {
      const parsed = JSON.parse(jsonContent);
      setError('');
      onChange(parsed);
      setIsEditing(false);
    } catch (err) {
      setError('Ошибка в JSON формате: ' + err.message);
    }
  };

  const handleReset = () => {
    if (jsonLd) {
      try {
        setJsonContent(JSON.stringify(jsonLd, null, 2));
      } catch (err) {
        console.error('Error resetting JSON-LD:', err);
        setJsonContent('{}');
      }
    }
    setError('');
    setIsEditing(false);
  };

  const validateJSON = (text) => {
    try {
      JSON.parse(text);
      setError('');
      return true;
    } catch (err) {
      setError('Ошибка в JSON формате: ' + err.message);
      return false;
    }
  };

  const getDisplayJson = () => {
    try {
      if (jsonLd) {
        return JSON.stringify(jsonLd, null, 2);
      }
      if (jsonContent) {
        return JSON.stringify(JSON.parse(jsonContent), null, 2);
      }
      return '{}';
    } catch (err) {
      console.error('Error displaying JSON:', err);
      return '{}';
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CodeBracketIcon className="h-5 w-5 text-blue-600" />
          <h3 className="text-lg font-medium text-gray-900">JSON-LD Разметка</h3>
        </div>
        <div className="flex gap-2">
          {!isEditing ? (
            <>
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-1 px-3 py-1 text-sm text-blue-600 hover:text-blue-700"
              >
                <PencilIcon className="h-4 w-4" />
                Редактировать
              </button>
              <button
                onClick={() => {
                  try {
                    const displayJson = getDisplayJson();
                    const win = window.open('', '_blank');
                    win.document.write(`
                      <html>
                        <head><title>JSON-LD Preview</title></head>
                        <body>
                          <pre style="font-family: monospace; padding: 20px; background: #f5f5f5;">
                            ${displayJson}
                          </pre>
                        </body>
                      </html>
                    `);
                  } catch (err) {
                    console.error('Error opening preview:', err);
                    alert('Ошибка при открытии предпросмотра');
                  }
                }}
                className="flex items-center gap-1 px-3 py-1 text-sm text-gray-600 hover:text-gray-700"
              >
                <EyeIcon className="h-4 w-4" />
                Предпросмотр
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleSave}
                className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Сохранить
              </button>
              <button
                onClick={handleReset}
                className="px-3 py-1 text-sm text-gray-600 hover:text-gray-700"
              >
                Отмена
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      <div className="relative">
        {isEditing ? (
          <textarea
            value={jsonContent}
            onChange={(e) => {
              setJsonContent(e.target.value);
              validateJSON(e.target.value);
            }}
            className="w-full h-64 p-4 font-mono text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Введите JSON-LD разметку..."
          />
        ) : (
          <div className="h-64 overflow-auto p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <pre className="text-sm font-mono text-gray-800 whitespace-pre-wrap">
              {getDisplayJson()}
            </pre>
          </div>
        )}
      </div>

      <div className="mt-4 text-xs text-gray-500">
        <p>JSON-LD разметка помогает поисковым системам лучше понимать содержимое страницы.</p>
        <p className="mt-1">Структурированные данные включают информацию о статье, авторе, издателе и датах публикации.</p>
      </div>
    </div>
  );
};

export default JSONLDEditor; 