import React, { useState, useEffect } from 'react';
import { 
  MagnifyingGlassIcon, 
  TagIcon, 
  CalendarIcon,
  ClockIcon,
  EyeIcon,
  ArrowDownIcon
} from '@heroicons/react/24/outline';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import Breadcrumbs from '../components/Breadcrumbs';
import { API_BASE_URL } from '../utils/config';

const BlogList = () => {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [availableTags, setAvailableTags] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    fetchPosts();
    fetchTags();
  }, [searchQuery, selectedTags, page]);

  const fetchPosts = async () => {
    try {
      const params = new URLSearchParams();
      params.append('page', page);
      params.append('limit', 12);
      if (searchQuery) params.append('search', searchQuery);
      if (selectedTags.length > 0) {
        selectedTags.forEach(tag => params.append('tags', tag));
      }
      
      const response = await fetch(`${API_BASE_URL}/api/blog/posts?${params}`);
      const data = await response.json();
      
      if (page === 1) {
        setPosts(data.posts || []);
      } else {
        setPosts(prev => [...prev, ...(data.posts || [])]);
      }
      
      setHasMore((data.posts || []).length === 12);
      setLoading(false);
      setLoadingMore(false);
    } catch (error) {
      console.error('Error fetching posts:', error);
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const fetchTags = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/blog/tags`);
      const data = await response.json();
      setAvailableTags(data.tags || []);
    } catch (error) {
      console.error('Error fetching tags:', error);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    setPosts([]);
  };

  const handleTagToggle = (tag) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
    setPage(1);
    setPosts([]);
  };

  const loadMore = () => {
    if (!loadingMore && hasMore) {
      setLoadingMore(true);
      setPage(prev => prev + 1);
    }
  };

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

  const breadcrumbItems = [
    { label: 'Блог', href: '/blog' }
  ];

  if (loading) {
    return (
      <>
        <Helmet>
          <title>Блог - Appointo</title>
          <meta name="description" content="Полезные статьи о красоте, здоровье и уходе за собой" />
          <meta property="og:title" content="Блог - Appointo" />
          <meta property="og:description" content="Полезные статьи о красоте, здоровье и уходе за собой" />
          <meta property="og:type" content="website" />
          <meta property="og:url" content={window.location.href} />
        </Helmet>
        
        <div className="min-h-screen bg-[#F9F7F6] py-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="animate-pulse">
              <div className="h-8 bg-gray-200 rounded w-1/4 mb-8"></div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="bg-white rounded-lg shadow-sm overflow-hidden">
                    <div className="h-48 bg-gray-200"></div>
                    <div className="p-6">
                      <div className="h-4 bg-gray-200 rounded mb-2"></div>
                      <div className="h-3 bg-gray-200 rounded mb-4"></div>
                      <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>Блог - Appointo</title>
        <meta name="description" content="Полезные статьи о красоте, здоровье и уходе за собой" />
        <meta property="og:title" content="Блог - Appointo" />
        <meta property="og:description" content="Полезные статьи о красоте, здоровье и уходе за собой" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={window.location.href} />
        <link rel="canonical" href={window.location.href} />
      </Helmet>

              <div className="min-h-screen bg-[#F9F7F6] py-12 pt-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Хлебные крошки */}
          <Breadcrumbs items={breadcrumbItems} />

          {/* Заголовок */}
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              Блог
            </h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Полезные статьи о красоте, здоровье и уходе за собой
            </p>
          </div>

          {/* Фильтры */}
          <div className="mb-8">
            {/* Поиск */}
            <form onSubmit={handleSearch} className="mb-6">
              <div className="relative max-w-md mx-auto">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Поиск статей..."
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </form>

            {/* Теги */}
            {availableTags.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2">
                {availableTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => handleTagToggle(tag)}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                      selectedTags.includes(tag)
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Сетка статей */}
          {posts.length > 0 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                {posts.map((post) => (
                  <article key={post.id} className="bg-white rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                    {/* Обложка */}
                    {post.cover_image && (
                      <div className="aspect-w-16 aspect-h-9">
                        <img
                          src={post.cover_image}
                          alt={post.cover_image_alt || post.title}
                          className="w-full h-48 object-cover"
                          loading="lazy"
                        />
                      </div>
                    )}
                    
                    {/* Контент */}
                    <div className="p-6">
                      {/* Мета-информация */}
                      <div className="flex items-center gap-4 text-sm text-gray-500 mb-3">
                        <div className="flex items-center gap-1">
                          <CalendarIcon className="h-4 w-4" />
                          {formatDate(post.published_at || post.created_at)}
                        </div>
                        {post.reading_time && (
                          <div className="flex items-center gap-1">
                            <ClockIcon className="h-4 w-4" />
                            {formatReadingTime(post.reading_time)}
                          </div>
                        )}
                      </div>

                      {/* Заголовок */}
                      <h2 className="text-xl font-bold text-gray-900 mb-3 line-clamp-2">
                        <Link 
                          to={`/blog/${post.slug}`}
                          className="hover:text-blue-600 transition-colors"
                        >
                          {post.title}
                        </Link>
                      </h2>

                      {/* Подзаголовок */}
                      {post.subtitle && (
                        <h3 className="text-lg text-gray-600 mb-3 line-clamp-2">
                          {post.subtitle}
                        </h3>
                      )}

                      {/* Краткий анонс */}
                      {post.excerpt && (
                        <p className="text-gray-600 mb-4 line-clamp-3">
                          {post.excerpt}
                        </p>
                      )}

                      {/* Теги */}
                      {post.tags && post.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-4">
                          {post.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs"
                            >
                              {tag}
                            </span>
                          ))}
                          {post.tags.length > 3 && (
                            <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">
                              +{post.tags.length - 3}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Кнопка "Читать далее" */}
                      <Link
                        to={`/blog/${post.slug}`}
                        className="inline-flex items-center text-blue-600 hover:text-blue-700 font-medium"
                      >
                        Читать далее
                        <EyeIcon className="ml-1 h-4 w-4" />
                      </Link>
                    </div>
                  </article>
                ))}
              </div>

              {/* Кнопка "Загрузить ещё" */}
              {hasMore && (
                <div className="text-center">
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loadingMore ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Загрузка...
                      </>
                    ) : (
                      <>
                        Загрузить ещё
                        <ArrowDownIcon className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12">
              <div className="text-gray-400 mb-4">
                <TagIcon className="h-12 w-12 mx-auto" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Статьи не найдены
              </h3>
              <p className="text-gray-600">
                Попробуйте изменить параметры поиска или фильтры
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default BlogList; 