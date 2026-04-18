import React from 'react';
import { CalendarIcon, ClockIcon, EyeIcon, UserIcon } from '@heroicons/react/24/outline';

const BlogMeta = ({ post, className = "" }) => {
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatReadingTime = (minutes) => {
    if (minutes < 1) return 'Меньше минуты';
    if (minutes === 1) return '1 минута';
    if (minutes < 5) return `${minutes} минуты`;
    return `${minutes} минут`;
  };

  return (
    <div className={`flex flex-wrap items-center gap-4 text-sm text-gray-500 ${className}`}>
      {/* Дата публикации */}
      <div className="flex items-center gap-1">
        <CalendarIcon className="h-4 w-4" />
        {formatDate(post.published_at || post.created_at)}
      </div>
      
      {/* Время чтения */}
      {post.reading_time && (
        <div className="flex items-center gap-1">
          <ClockIcon className="h-4 w-4" />
          {formatReadingTime(post.reading_time)}
        </div>
      )}

      {/* Количество слов */}
      {post.word_count && (
        <div className="flex items-center gap-1">
          <EyeIcon className="h-4 w-4" />
          {post.word_count} слов
        </div>
      )}

      {/* Автор */}
      {post.author_name && (
        <div className="flex items-center gap-1">
          <UserIcon className="h-4 w-4" />
          {post.author_name}
        </div>
      )}
    </div>
  );
};

export default BlogMeta; 