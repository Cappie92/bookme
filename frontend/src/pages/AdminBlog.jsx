import React, { useState, useEffect } from 'react';
import { 
  PlusIcon, 
  PencilIcon, 
  TrashIcon, 
  EyeIcon,
  DocumentTextIcon,
  CalendarIcon,
  ClockIcon,
  TagIcon,
  PhotoIcon,
  GlobeAltIcon,
  CogIcon,
  PresentationChartBarIcon,
  EyeSlashIcon
} from '@heroicons/react/24/outline';
import { API_BASE_URL } from '../utils/config';
import BlogEditor from '../components/BlogEditor';
import SEOAnalyzer from '../components/SEOAnalyzer';
import JSONLDEditor from '../components/JSONLDEditor';
import BlogPreview from '../components/BlogPreview';
import ConfirmCloseModal from '../modals/ConfirmCloseModal';

const AdminBlog = () => {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [tags, setTags] = useState([]);
  const [filterStatus, setFilterStatus] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [previewPost, setPreviewPost] = useState(null);
  const [activeTab, setActiveTab] = useState('content'); // content, seo, jsonld
  const [showConfirmClose, setShowConfirmClose] = useState(false);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [apiError, setApiError] = useState('');

  // Состояние формы
  const [formData, setFormData] = useState({
    title: '',
    subtitle: '',
    slug: '',
    excerpt: '',
    content: '',
    cover_image: '',
    cover_image_alt: '',
    tags: [],
    meta_title: '',
    meta_description: '',
    canonical_url: '',
    robots_noindex: false,
    robots_nofollow: false,
    og_title: '',
    og_description: '',
    og_image: '',
    twitter_title: '',
    twitter_description: '',
    twitter_image: '',
    json_ld: null,
    status: 'draft',
    scheduled_at: ''
  });

  // Состояние для ввода нового тега
  const [newTag, setNewTag] = useState('');

  useEffect(() => {
    fetchPosts();
    fetchTags();
  }, [filterStatus, searchTerm]);

  const fetchPosts = async () => {
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.append('status', filterStatus);
      if (searchTerm) params.append('search', searchTerm);
      
      const token = localStorage.getItem('access_token');
      console.log('Токен для запроса статей:', token ? 'Есть' : 'Отсутствует');
      
      const response = await fetch(`${API_BASE_URL}/api/admin/blog/posts?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setPosts(Array.isArray(data) ? data : []);
        setApiError('');
      } else {
        console.error('Ошибка загрузки статей:', response.status, response.statusText);
        setPosts([]);
        setApiError(`Ошибка загрузки статей: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('Ошибка сети при загрузке статей:', error);
      setPosts([]);
      setApiError('Ошибка сети при загрузке статей. Проверьте подключение к серверу.');
    } finally {
      setLoading(false);
    }
  };

  const fetchTags = async () => {
    try {
      const token = localStorage.getItem('access_token');
      console.log('Токен для запроса тегов:', token ? 'Есть' : 'Отсутствует');
      
      const response = await fetch(`${API_BASE_URL}/api/admin/blog/tags`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setTags(Array.isArray(data.tags) ? data.tags : []);
      } else {
        console.error('Ошибка загрузки тегов:', response.status, response.statusText);
        setTags([]);
      }
    } catch (error) {
      console.error('Ошибка сети при загрузке тегов:', error);
      setTags([]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Валидация обязательных полей
    if (!formData.title.trim()) {
      setSubmitError('Заголовок обязателен');
      return;
    }
    
    if (!formData.content.trim()) {
      setSubmitError('Контент обязателен');
      return;
    }
    
    setSubmitLoading(true);
    setSubmitError('');
    
    try {
      const url = editingPost 
        ? `${API_BASE_URL}/api/admin/blog/posts/${editingPost.id}`
        : `${API_BASE_URL}/api/admin/blog/posts`;
      
      const method = editingPost ? 'PUT' : 'POST';
      
      // Подготавливаем данные для отправки
      const postData = {
        ...formData,
        title: formData.title.trim(),
        content: formData.content.trim(),
        slug: formData.slug.trim() || generateSlug(formData.title.trim())
      };
      
      // Очищаем пустые поля даты - заменяем пустые строки на null
      if (postData.scheduled_at === '') {
        postData.scheduled_at = null;
      }
      if (postData.published_at === '') {
        postData.published_at = null;
      }
      
      // Очищаем пустые строки для опциональных полей
      const optionalFields = [
        'subtitle', 'excerpt', 'cover_image', 'cover_image_alt', 
        'meta_title', 'meta_description', 'canonical_url',
        'og_title', 'og_description', 'og_image',
        'twitter_title', 'twitter_description', 'twitter_image'
      ];
      
      optionalFields.forEach(field => {
        if (postData[field] === '') {
          postData[field] = null;
        }
      });
      
      console.log('Отправляем данные:', postData);
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        },
        body: JSON.stringify(postData)
      });
      
      console.log('Ответ сервера:', response.status, response.statusText);
      
      if (response.ok) {
        const result = await response.json();
        console.log('Статья сохранена:', result);
        setShowModal(false);
        setEditingPost(null);
        resetForm();
        fetchPosts();
      } else {
        const errorData = await response.json().catch(() => ({ detail: 'Неизвестная ошибка' }));
        console.error('Ошибка сервера:', errorData);
        
        // Форматируем ошибку для отображения
        let errorMessage = '';
        if (errorData.detail) {
          if (Array.isArray(errorData.detail)) {
            errorMessage = errorData.detail.map(err => {
              if (typeof err === 'object' && err.msg) {
                return `${err.loc?.join('.') || 'Поле'}: ${err.msg}`;
              }
              return err;
            }).join(', ');
          } else {
            errorMessage = errorData.detail;
          }
        } else {
          errorMessage = `Ошибка ${response.status}: ${response.statusText}`;
        }
        
        setSubmitError(errorMessage);
      }
    } catch (error) {
      console.error('Ошибка сети:', error);
      setSubmitError(`Ошибка сети: ${error.message}`);
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleEdit = (post) => {
    setEditingPost(post);
    setSlugManuallyEdited(false); // Сбрасываем флаг при редактировании
    setSubmitError(''); // Сбрасываем ошибки
    setFormData({
      title: post.title,
      subtitle: post.subtitle || '',
      slug: post.slug,
      excerpt: post.excerpt || '',
      content: post.content,
      cover_image: post.cover_image || '',
      cover_image_alt: post.cover_image_alt || '',
      tags: post.tags || [],
      meta_title: post.meta_title || '',
      meta_description: post.meta_description || '',
      canonical_url: post.canonical_url || '',
      robots_noindex: post.robots_noindex || false,
      robots_nofollow: post.robots_nofollow || false,
      og_title: post.og_title || '',
      og_description: post.og_description || '',
      og_image: post.og_image || '',
      twitter_title: post.twitter_title || '',
      twitter_description: post.twitter_description || '',
      twitter_image: post.twitter_image || '',
      json_ld: post.json_ld || null,
      status: post.status,
      scheduled_at: post.scheduled_at || ''
    });
    setShowModal(true);
  };

  const handleDelete = async (postId) => {
    if (!confirm('Вы уверены, что хотите удалить этот пост?')) return;
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/blog/posts/${postId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      });
      
      if (response.ok) {
        fetchPosts();
      }
    } catch (error) {
      console.error('Error deleting post:', error);
    }
  };

  const handlePublish = async (postId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/blog/posts/${postId}/publish`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      });
      
      if (response.ok) {
        fetchPosts();
      }
    } catch (error) {
      console.error('Error publishing post:', error);
    }
  };

  const handlePreview = (post) => {
    setPreviewPost(post);
    setShowPreview(true);
  };

  const resetForm = () => {
    setFormData({
      title: '',
      subtitle: '',
      slug: '',
      excerpt: '',
      content: '',
      cover_image: '',
      cover_image_alt: '',
      tags: [],
      meta_title: '',
      meta_description: '',
      canonical_url: '',
      robots_noindex: false,
      robots_nofollow: false,
      og_title: '',
      og_description: '',
      og_image: '',
      twitter_title: '',
      twitter_description: '',
      twitter_image: '',
      json_ld: null,
      status: 'draft',
      scheduled_at: ''
    });
    setNewTag(''); // Сбрасываем поле для ввода нового тега
    setSlugManuallyEdited(false); // Сбрасываем флаг ручного редактирования slug
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      setShowConfirmClose(true)
    }
  }

  const handleCloseClick = () => {
    setShowConfirmClose(true)
  }

  const handleConfirmClose = () => {
    setShowConfirmClose(false)
    setShowModal(false)
    setEditingPost(null)
    resetForm()
  }

  const handleCancelClose = () => {
    setShowConfirmClose(false)
  }

  // Функция транслитерации кириллицы в латиницу
  const cyrillicToTranslit = (text) => {
    const map = {
      а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
      А: 'A', Б: 'B', В: 'V', Г: 'G', Д: 'D', Е: 'E', Ё: 'E', Ж: 'Zh', З: 'Z', И: 'I', Й: 'Y', К: 'K', Л: 'L', М: 'M', Н: 'N', О: 'O', П: 'P', Р: 'R', С: 'S', Т: 'T', У: 'U', Ф: 'F', Х: 'H', Ц: 'Ts', Ч: 'Ch', Ш: 'Sh', Щ: 'Sch', Ъ: '', Ы: 'Y', Ь: '', Э: 'E', Ю: 'Yu', Я: 'Ya'
    };
    return text.split('').map(char => map[char] !== undefined ? map[char] : char).join('');
  };

  // Функция для генерации slug из заголовка с транслитерацией
  const generateSlug = (title) => {
    const translit = cyrillicToTranslit(title);
    return translit
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '') // Только латиница, цифры, пробелы, дефисы
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
  };

  // Обработчик изменения заголовка
  const handleTitleChange = (title) => {
    setSubmitError(''); // Сбрасываем ошибки при изменении
    setFormData(prev => {
      // Если slug не меняли вручную, обновляем его
      const newSlug = !slugManuallyEdited ? generateSlug(title) : prev.slug;
      return {
        ...prev,
        title,
        slug: newSlug
      };
    });
  };

  // Обработчик изменения slug вручную
  const handleSlugChange = (slug) => {
    setFormData(prev => ({ ...prev, slug }));
    setSlugManuallyEdited(true);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'published': return 'bg-green-100 text-green-800';
      case 'scheduled': return 'bg-blue-100 text-blue-800';
      case 'draft': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'published': return 'Опубликован';
      case 'scheduled': return 'Запланирован';
      case 'draft': return 'Черновик';
      default: return 'Неизвестно';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Заголовок */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Управление блогом</h1>
          <p className="text-gray-600">Создавайте и редактируйте статьи с SEO-оптимизацией</p>
        </div>
        <button
          onClick={() => {
            setEditingPost(null);
            resetForm();
            setSubmitError(''); // Сбрасываем ошибки
            setShowModal(true);
          }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <PlusIcon className="h-5 w-5" />
          Новая статья
        </button>
      </div>

      {/* Фильтры */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Поиск по заголовку..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">Все статусы</option>
            <option value="draft">Черновики</option>
            <option value="scheduled">Запланированные</option>
            <option value="published">Опубликованные</option>
          </select>
        </div>
      </div>

      {/* Ошибка API */}
      {apiError && (
        <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
          <p className="font-medium">Ошибка подключения к API:</p>
          <p className="text-sm">{apiError}</p>
          <button
            onClick={() => {
              setApiError('');
              fetchPosts();
              fetchTags();
            }}
            className="mt-2 px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
          >
            Попробовать снова
          </button>
        </div>
      )}

      {/* Список статей */}
      <div className="bg-white rounded-lg shadow">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Статья
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Автор
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Статус
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  SEO
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Дата
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Действия
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {Array.isArray(posts) && posts.length > 0 ? (
                posts.map((post) => (
                  <tr key={post.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      {post.cover_image && (
                        <img
                          src={post.cover_image}
                          alt={post.cover_image_alt || post.title}
                          className="h-12 w-12 rounded-lg object-cover mr-3"
                        />
                      )}
                      <div>
                        <div className="text-sm font-medium text-gray-900">{post.title}</div>
                        {post.subtitle && (
                          <div className="text-sm text-gray-500">{post.subtitle}</div>
                        )}
                        <div className="text-xs text-gray-400">{post.slug}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {post.author_name}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(post.status)}`}>
                      {getStatusText(post.status)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                        <div 
                          className="bg-green-600 h-2 rounded-full" 
                          style={{ width: `${post.seo_score || 0}%` }}
                        ></div>
                      </div>
                      <span className="text-xs text-gray-500">{post.seo_score || 0}%</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {new Date(post.created_at).toLocaleDateString('ru-RU')}
                  </td>
                  <td className="px-6 py-4 text-right text-sm font-medium">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => handlePreview(post)}
                        className="text-purple-600 hover:text-purple-900"
                        title="Предпросмотр"
                      >
                        <EyeIcon className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleEdit(post)}
                        className="text-blue-600 hover:text-blue-900"
                        title="Редактировать"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </button>
                      {post.status === 'draft' && (
                        <button
                          onClick={() => handlePublish(post.id)}
                          className="text-green-600 hover:text-green-900"
                          title="Опубликовать"
                        >
                          <EyeSlashIcon className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(post.id)}
                        className="text-red-600 hover:text-red-900"
                        title="Удалить"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
              ) : (
                <tr>
                  <td colSpan="6" className="px-6 py-8 text-center text-gray-500">
                    {loading ? 'Загрузка статей...' : 'Статьи не найдены'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Модальное окно редактирования */}
      {showModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={handleBackdropClick}
        >
          <div className="bg-white rounded-lg w-full max-w-6xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold">
                  {editingPost ? 'Редактировать статью' : 'Новая статья'}
                </h2>
                <button
                  onClick={handleCloseClick}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>

              {/* Вкладки */}
              <div className="border-b border-gray-200 mb-6">
                <nav className="flex space-x-8">
                  <button
                    onClick={() => setActiveTab('content')}
                    className={`py-2 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'content'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    Контент
                  </button>
                  <button
                    onClick={() => setActiveTab('seo')}
                    className={`py-2 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'seo'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    SEO
                  </button>
                  <button
                    onClick={() => setActiveTab('jsonld')}
                    className={`py-2 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'jsonld'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    JSON-LD
                  </button>
                </nav>
              </div>

              <form onSubmit={handleSubmit}>
                {/* Вкладка Контент */}
                {activeTab === 'content' && (
                  <div className="space-y-6">
                    {/* Основная информация */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Заголовок *
                        </label>
                        <input
                          type="text"
                          value={formData.title}
                          onChange={e => handleTitleChange(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Подзаголовок
                        </label>
                        <input
                          type="text"
                          value={formData.subtitle}
                          onChange={(e) => setFormData({...formData, subtitle: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Slug (URL)
                        </label>
                        <input
                          type="text"
                          value={formData.slug}
                          onChange={e => handleSlugChange(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          placeholder="Автоматически формируется из заголовка"
                        />
                        <div className="text-xs text-gray-500 mt-1">
                          {slugManuallyEdited 
                            ? "Slug изменен вручную. Автоматическое обновление отключено."
                            : "Автоматически формируется из заголовка. Можно изменить вручную."
                          }
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Статус
                        </label>
                        <select
                          value={formData.status}
                          onChange={(e) => setFormData({...formData, status: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="draft">Черновик</option>
                          <option value="scheduled">Запланирован</option>
                          <option value="published">Опубликован</option>
                        </select>
                      </div>
                    </div>

                    {/* Краткий анонс */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Краткий анонс (до 160 символов)
                      </label>
                      <textarea
                        value={formData.excerpt}
                        onChange={(e) => setFormData({...formData, excerpt: e.target.value})}
                        maxLength={160}
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                      <div className="text-xs text-gray-500 mt-1">
                        {formData.excerpt.length}/160 символов
                      </div>
                    </div>

                    {/* Обложка */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          URL обложки
                        </label>
                        <input
                          type="url"
                          value={formData.cover_image}
                          onChange={(e) => setFormData({...formData, cover_image: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Alt текст для обложки
                        </label>
                        <input
                          type="text"
                          value={formData.cover_image_alt}
                          onChange={(e) => setFormData({...formData, cover_image_alt: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>

                    {/* Теги */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Теги
                      </label>
                      
                      {/* Поле для ввода нового тега */}
                      <div className="mb-3">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Введите новый тег..."
                            value={newTag}
                            onChange={(e) => setNewTag(e.target.value)}
                            onKeyPress={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                if (newTag.trim() && !formData.tags.includes(newTag.trim())) {
                                  setFormData({...formData, tags: [...formData.tags, newTag.trim()]});
                                  setNewTag('');
                                }
                              }
                            }}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (newTag.trim() && !formData.tags.includes(newTag.trim())) {
                                setFormData({...formData, tags: [...formData.tags, newTag.trim()]});
                                setNewTag('');
                              }
                            }}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                          >
                            Добавить
                          </button>
                        </div>
                      </div>

                      {/* Существующие теги для быстрого добавления */}
                      <div className="mb-3">
                        <p className="text-sm text-gray-600 mb-2">Быстрое добавление:</p>
                        <div className="flex flex-wrap gap-2">
                          {tags.map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => {
                                if (!formData.tags.includes(tag)) {
                                  setFormData({...formData, tags: [...formData.tags, tag]});
                                }
                              }}
                              className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200"
                            >
                              {tag}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Выбранные теги */}
                      <div>
                        <p className="text-sm text-gray-600 mb-2">Выбранные теги:</p>
                        <div className="flex flex-wrap gap-2">
                          {formData.tags.map((tag, index) => (
                            <span
                              key={index}
                              className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm flex items-center gap-1"
                            >
                              {tag}
                              <button
                                type="button"
                                onClick={() => setFormData({
                                  ...formData, 
                                  tags: formData.tags.filter((_, i) => i !== index)
                                })}
                                className="text-blue-500 hover:text-blue-700"
                              >
                                ✕
                              </button>
                            </span>
                          ))}
                          {formData.tags.length === 0 && (
                            <p className="text-sm text-gray-400">Теги не выбраны</p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* WYSIWYG Редактор */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Контент *
                      </label>
                      <BlogEditor
                        content={formData.content}
                        onChange={(content) => setFormData({...formData, content})}
                        placeholder="Начните писать вашу статью..."
                      />
                    </div>
                  </div>
                )}

                {/* Вкладка SEO */}
                {activeTab === 'seo' && (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* SEO Анализ */}
                    <div className="lg:col-span-1">
                      <SEOAnalyzer
                        title={formData.title}
                        content={formData.content}
                        metaDescription={formData.meta_description}
                        excerpt={formData.excerpt}
                      />
                    </div>

                    {/* SEO Настройки */}
                    <div className="lg:col-span-2 space-y-6">
                      {/* Meta теги */}
                      <div className="bg-white rounded-lg border border-gray-200 p-4">
                        <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
                          <GlobeAltIcon className="h-5 w-5" />
                          Meta теги
                        </h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Meta Title
                            </label>
                            <input
                              type="text"
                              value={formData.meta_title}
                              onChange={(e) => setFormData({...formData, meta_title: e.target.value})}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Meta Description
                            </label>
                            <textarea
                              value={formData.meta_description}
                              onChange={(e) => setFormData({...formData, meta_description: e.target.value})}
                              maxLength={160}
                              rows={3}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Canonical URL
                            </label>
                            <input
                              type="url"
                              value={formData.canonical_url}
                              onChange={(e) => setFormData({...formData, canonical_url: e.target.value})}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Robots
                            </label>
                            <div className="space-y-2">
                              <label className="flex items-center">
                                <input
                                  type="checkbox"
                                  checked={formData.robots_noindex}
                                  onChange={(e) => setFormData({...formData, robots_noindex: e.target.checked})}
                                  className="mr-2"
                                />
                                Noindex
                              </label>
                              <label className="flex items-center">
                                <input
                                  type="checkbox"
                                  checked={formData.robots_nofollow}
                                  onChange={(e) => setFormData({...formData, robots_nofollow: e.target.checked})}
                                  className="mr-2"
                                />
                                Nofollow
                              </label>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Open Graph */}
                      <div className="bg-white rounded-lg border border-gray-200 p-4">
                        <h3 className="text-lg font-medium text-gray-900 mb-4">Open Graph</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              OG Title
                            </label>
                            <input
                              type="text"
                              value={formData.og_title}
                              onChange={(e) => setFormData({...formData, og_title: e.target.value})}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              OG Description
                            </label>
                            <textarea
                              value={formData.og_description}
                              onChange={(e) => setFormData({...formData, og_description: e.target.value})}
                              rows={3}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              OG Image URL
                            </label>
                            <input
                              type="url"
                              value={formData.og_image}
                              onChange={(e) => setFormData({...formData, og_image: e.target.value})}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Twitter Cards */}
                      <div className="bg-white rounded-lg border border-gray-200 p-4">
                        <h3 className="text-lg font-medium text-gray-900 mb-4">Twitter Cards</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Twitter Title
                            </label>
                            <input
                              type="text"
                              value={formData.twitter_title}
                              onChange={(e) => setFormData({...formData, twitter_title: e.target.value})}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Twitter Description
                            </label>
                            <textarea
                              value={formData.twitter_description}
                              onChange={(e) => setFormData({...formData, twitter_description: e.target.value})}
                              rows={3}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Twitter Image URL
                            </label>
                            <input
                              type="url"
                              value={formData.twitter_image}
                              onChange={(e) => setFormData({...formData, twitter_image: e.target.value})}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Вкладка JSON-LD */}
                {activeTab === 'jsonld' && (
                  <div>
                    <JSONLDEditor
                      jsonLd={formData.json_ld}
                      onChange={(jsonLd) => setFormData({...formData, json_ld: jsonLd})}
                      postData={formData}
                    />
                  </div>
                )}

                {/* Ошибки */}
                {submitError && (
                  <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg">
                    <p className="text-sm font-medium">Ошибка:</p>
                    <p className="text-sm">{typeof submitError === 'string' ? submitError : JSON.stringify(submitError)}</p>
                  </div>
                )}

                {/* Кнопки */}
                <div className="flex justify-between gap-4 pt-6 border-t mt-6">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handlePreview(formData)}
                      className="px-4 py-2 text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100"
                      disabled={submitLoading}
                    >
                      Предпросмотр
                    </button>
                  </div>
                  <div className="flex gap-4">
                    <button
                      type="button"
                      onClick={handleCloseClick}
                      className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                      disabled={submitLoading}
                    >
                      Отмена
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={submitLoading}
                    >
                      {submitLoading ? (
                        <span className="flex items-center gap-2">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          {editingPost ? 'Обновление...' : 'Создание...'}
                        </span>
                      ) : (
                        editingPost ? 'Обновить' : 'Создать'
                      )}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно предварительного просмотра */}
      {showPreview && previewPost && (
        <BlogPreview
          post={previewPost}
          onClose={() => setShowPreview(false)}
        />
      )}

      {/* Модальное окно подтверждения закрытия */}
      <ConfirmCloseModal
        open={showConfirmClose}
        onConfirm={handleConfirmClose}
        onCancel={handleCancelClose}
        modalTitle={editingPost ? "редактирование статьи" : "создание статьи"}
      />
    </div>
  );
};

export default AdminBlog; 