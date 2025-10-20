import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { 
  CalendarIcon,
  ClockIcon,
  TagIcon,
  ArrowLeftIcon,
  ShareIcon,
  EyeIcon
} from '@heroicons/react/24/outline';
import { Helmet } from 'react-helmet-async';
import BlogNavigation from '../components/BlogNavigation';
import Breadcrumbs from '../components/Breadcrumbs';

const BlogPost = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [relatedPosts, setRelatedPosts] = useState([]);
  const [showShareMenu, setShowShareMenu] = useState(false);

  useEffect(() => {
    fetchPost();
    fetchRelatedPosts();
    trackPageView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const fetchPost = async () => {
    try {
      const response = await fetch(`/api/blog/posts/${slug}`);
      if (!response.ok) {
        navigate('/blog');
        return;
      }
      const data = await response.json();
      setPost(data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching post:', error);
      navigate('/blog');
    }
  };

  const fetchRelatedPosts = async () => {
    try {
      const response = await fetch(`/api/blog/posts/${slug}/related`);
      const data = await response.json();
      setRelatedPosts(data.posts || []);
    } catch (error) {
      console.error('Error fetching related posts:', error);
    }
  };

  const trackPageView = () => {
    if (window.gtag) {
      window.gtag('event', 'page_view', {
        page_title: post?.title,
        page_location: window.location.href,
      });
    }
    
    if (window.ym) {
      window.ym(window.YM_ID, 'hit', window.location.href, {
        title: post?.title
      });
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

  const sharePost = (platform) => {
    const url = window.location.href;
    const title = post?.title || '';
    const description = post?.excerpt || '';

    let shareUrl = '';
    switch (platform) {
      case 'vk':
        shareUrl = `https://vk.com/share.php?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}&description=${encodeURIComponent(description)}`;
        break;
      case 'telegram':
        shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title + ' ' + description)}`;
        break;
      case 'facebook':
        shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
        break;
      case 'twitter':
        shareUrl = `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`;
        break;
      case 'whatsapp':
        shareUrl = `https://wa.me/?text=${encodeURIComponent(title + ' ' + url)}`;
        break;
      default:
        return;
    }

    window.open(shareUrl, '_blank', 'width=600,height=400');
    setShowShareMenu(false);
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      alert('Ссылка скопирована в буфер обмена!');
    } catch (error) {
      console.error('Error copying to clipboard:', error);
    }
    setShowShareMenu(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F9F7F6] py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/3 mb-8"></div>
            <div className="h-64 bg-gray-200 rounded mb-6"></div>
            <div className="space-y-4">
              <div className="h-6 bg-gray-200 rounded"></div>
              <div className="h-4 bg-gray-200 rounded w-2/3"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!post) {
    return null;
  }

  const breadcrumbItems = [
    { label: 'Блог', href: '/blog' },
    { label: post.title, href: `/blog/${post.slug}` }
  ];

  return (
    <>
      <Helmet>
        <title>{post.meta_title || post.title}</title>
        <meta name="description" content={post.meta_description || post.excerpt} />
        {post.canonical_url && <link rel="canonical" href={post.canonical_url} />}
        
        <meta property="og:title" content={post.og_title || post.title} />
        <meta property="og:description" content={post.og_description || post.excerpt} />
        <meta property="og:image" content={post.og_image || post.cover_image} />
        <meta property="og:url" content={window.location.href} />
        <meta property="og:type" content="article" />
        <meta property="og:site_name" content="Appointo" />
        
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={post.twitter_title || post.title} />
        <meta name="twitter:description" content={post.twitter_description || post.excerpt} />
        <meta name="twitter:image" content={post.twitter_image || post.cover_image} />
        
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            "headline": post.title,
            "description": post.excerpt,
            "image": post.cover_image,
            "author": {
              "@type": "Person",
              "name": post.author_name || "Автор"
            },
            "publisher": {
              "@type": "Organization",
              "name": "Appointo",
              "logo": {
                "@type": "ImageObject",
                "url": "https://appointo.ru/logo.png"
              }
            },
            "datePublished": post.published_at,
            "dateModified": post.updated_at,
            "mainEntityOfPage": {
              "@type": "WebPage",
              "@id": window.location.href
            },
            "wordCount": post.word_count,
            "timeRequired": `PT${post.reading_time || 1}M`
          })}
        </script>
        
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
              {
                "@type": "ListItem",
                "position": 1,
                "name": "Главная",
                "item": "https://appointo.ru"
              },
              {
                "@type": "ListItem",
                "position": 2,
                "name": "Блог",
                "item": "https://appointo.ru/blog"
              },
              {
                "@type": "ListItem",
                "position": 3,
                "name": post.title,
                "item": window.location.href
              }
            ]
          })}
        </script>
      </Helmet>

      <div className="min-h-screen bg-[#F9F7F6] py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Хлебные крошки */}
          <Breadcrumbs items={breadcrumbItems} />

          <nav className="mb-8">
            <Link 
              to="/blog"
              className="inline-flex items-center text-blue-600 hover:text-blue-700"
            >
              <ArrowLeftIcon className="h-4 w-4 mr-1" />
              Назад к блогу
            </Link>
          </nav>

          <article className="bg-white rounded-lg shadow-sm overflow-hidden">
            <header className="p-8 border-b border-gray-200">
              <h1 className="text-4xl font-bold text-gray-900 mb-4">
                {post.title}
              </h1>
              
              {post.subtitle && (
                <h2 className="text-xl text-gray-600 mb-6">
                  {post.subtitle}
                </h2>
              )}

              <div className="flex flex-wrap items-center gap-6 text-sm text-gray-500">
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

                {post.word_count && (
                  <div className="flex items-center gap-1">
                    <EyeIcon className="h-4 w-4" />
                    {post.word_count} слов
                  </div>
                )}

                <div className="relative ml-auto">
                  <button
                    onClick={() => setShowShareMenu(!showShareMenu)}
                    className="flex items-center gap-1 text-blue-600 hover:text-blue-700"
                  >
                    <ShareIcon className="h-4 w-4" />
                    Поделиться
                  </button>

                  {showShareMenu && (
                    <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-10">
                      <button
                        onClick={() => sharePost('vk')}
                        className="w-full px-4 py-2 text-left hover:bg-gray-50 text-sm"
                      >
                        ВКонтакте
                      </button>
                      <button
                        onClick={() => sharePost('telegram')}
                        className="w-full px-4 py-2 text-left hover:bg-gray-50 text-sm"
                      >
                        Telegram
                      </button>
                      <button
                        onClick={() => sharePost('facebook')}
                        className="w-full px-4 py-2 text-left hover:bg-gray-50 text-sm"
                      >
                        Facebook
                      </button>
                      <button
                        onClick={() => sharePost('twitter')}
                        className="w-full px-4 py-2 text-left hover:bg-gray-50 text-sm"
                      >
                        Twitter
                      </button>
                      <button
                        onClick={() => sharePost('whatsapp')}
                        className="w-full px-4 py-2 text-left hover:bg-gray-50 text-sm"
                      >
                        WhatsApp
                      </button>
                      <hr className="my-1" />
                      <button
                        onClick={copyToClipboard}
                        className="w-full px-4 py-2 text-left hover:bg-gray-50 text-sm"
                      >
                        Скопировать ссылку
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </header>

            {post.cover_image && (
              <div className="p-8 pb-0">
                <img
                  src={post.cover_image}
                  alt={post.cover_image_alt || post.title}
                  className="w-full h-64 md:h-96 object-cover rounded-lg"
                  loading="lazy"
                />
              </div>
            )}

            <div className="p-8">
              <div 
                className="prose prose-lg max-w-none"
                dangerouslySetInnerHTML={{ __html: post.content }}
              />

              {post.tags && post.tags.length > 0 && (
                <div className="mt-8 pt-8 border-t border-gray-200">
                  <div className="flex items-center gap-2 mb-4">
                    <TagIcon className="h-5 w-5 text-gray-500" />
                    <h3 className="text-lg font-medium text-gray-900">Теги</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {post.tags.map((tag) => (
                      <Link
                        key={tag}
                        to={`/blog?tags=${encodeURIComponent(tag)}`}
                        className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm hover:bg-blue-200 transition-colors"
                      >
                        {tag}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </article>

          {/* Навигация между статьями */}
          <BlogNavigation currentSlug={slug} />

          {relatedPosts.length > 0 && (
            <div className="mt-8">
              <h3 className="text-2xl font-bold text-gray-900 mb-6">
                Похожие статьи
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {relatedPosts.slice(0, 2).map((relatedPost) => (
                  <article key={relatedPost.id} className="bg-white rounded-lg shadow-sm overflow-hidden">
                    {relatedPost.cover_image && (
                      <img
                        src={relatedPost.cover_image}
                        alt={relatedPost.cover_image_alt || relatedPost.title}
                        className="w-full h-32 object-cover"
                        loading="lazy"
                      />
                    )}
                    <div className="p-4">
                      <h4 className="text-lg font-bold text-gray-900 mb-2">
                        <Link 
                          to={`/blog/${relatedPost.slug}`}
                          className="hover:text-blue-600 transition-colors"
                        >
                          {relatedPost.title}
                        </Link>
                      </h4>
                      {relatedPost.excerpt && (
                        <p className="text-gray-600 text-sm line-clamp-2">
                          {relatedPost.excerpt}
                        </p>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default BlogPost; 