import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftIcon, ArrowRightIcon } from '@heroicons/react/24/outline';

const BlogNavigation = ({ currentSlug }) => {
  const [prevPost, setPrevPost] = useState(null);
  const [nextPost, setNextPost] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNavigationPosts();
  }, [currentSlug]);

  const fetchNavigationPosts = async () => {
    try {
      const response = await fetch(`/api/blog/posts/${currentSlug}/navigation`);
      const data = await response.json();
      setPrevPost(data.prev_post);
      setNextPost(data.next_post);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching navigation posts:', error);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="mt-12 pt-8 border-t border-gray-200">
        <div className="flex justify-between items-center">
          <div className="animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-32 mb-2"></div>
            <div className="h-3 bg-gray-200 rounded w-24"></div>
          </div>
          <div className="animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-32 mb-2"></div>
            <div className="h-3 bg-gray-200 rounded w-24"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!prevPost && !nextPost) {
    return null;
  }

  return (
    <div className="mt-12 pt-8 border-t border-gray-200">
      <div className="flex justify-between items-center">
        {/* Предыдущая статья */}
        {prevPost ? (
          <Link
            to={`/blog/${prevPost.slug}`}
            className="flex items-center group max-w-xs"
          >
            <ArrowLeftIcon className="h-4 w-4 mr-2 text-gray-400 group-hover:text-blue-600 transition-colors" />
            <div className="text-left">
              <div className="text-sm text-gray-500 mb-1">Предыдущая</div>
              <div className="text-sm font-medium text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-2">
                {prevPost.title}
              </div>
            </div>
          </Link>
        ) : (
          <div></div>
        )}

        {/* Следующая статья */}
        {nextPost ? (
          <Link
            to={`/blog/${nextPost.slug}`}
            className="flex items-center group max-w-xs text-right"
          >
            <div className="text-right">
              <div className="text-sm text-gray-500 mb-1">Следующая</div>
              <div className="text-sm font-medium text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-2">
                {nextPost.title}
              </div>
            </div>
            <ArrowRightIcon className="h-4 w-4 ml-2 text-gray-400 group-hover:text-blue-600 transition-colors" />
          </Link>
        ) : (
          <div></div>
        )}
      </div>
    </div>
  );
};

export default BlogNavigation; 