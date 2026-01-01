/**
 * SEO Head Component
 *
 * Provides SEO meta tags and social sharing support using react-helmet-async.
 */

import { Helmet } from 'react-helmet-async';

interface SEOHeadProps {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: 'website' | 'article';
  author?: string;
  publishedTime?: string;
  tags?: string[];
}

const DEFAULT_TITLE = 'BitBoard - Decentralized Message Board';
const DEFAULT_DESCRIPTION =
  'A terminal-styled message board built on the Nostr protocol. Create topic boards, location-based channels, and encrypted discussions.';
const DEFAULT_IMAGE = '/og-image.png'; // You'll need to create this
const SITE_NAME = 'BitBoard';
const TWITTER_HANDLE = '@bitboard'; // Update with actual handle

export function SEOHead({
  title,
  description = DEFAULT_DESCRIPTION,
  image = DEFAULT_IMAGE,
  url,
  type = 'website',
  author,
  publishedTime,
  tags = [],
}: SEOHeadProps) {
  const fullTitle = title ? `${title} | ${SITE_NAME}` : DEFAULT_TITLE;
  const fullUrl = url || (typeof window !== 'undefined' ? window.location.href : '');
  const fullImage = image.startsWith('http') ? image : `${window.location.origin}${image}`;

  return (
    <Helmet>
      {/* Basic meta tags */}
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      {author && <meta name="author" content={author} />}
      {tags.length > 0 && <meta name="keywords" content={tags.join(', ')} />}

      {/* Open Graph / Facebook */}
      <meta property="og:type" content={type} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={fullImage} />
      <meta property="og:url" content={fullUrl} />
      <meta property="og:site_name" content={SITE_NAME} />

      {/* Article-specific OG tags */}
      {type === 'article' && publishedTime && (
        <meta property="article:published_time" content={publishedTime} />
      )}
      {type === 'article' && author && <meta property="article:author" content={author} />}
      {type === 'article' &&
        tags.map((tag) => <meta key={tag} property="article:tag" content={tag} />)}

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content={TWITTER_HANDLE} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={fullImage} />

      {/* Additional meta tags */}
      <meta name="robots" content="index, follow" />
      <meta name="googlebot" content="index, follow" />
      <link rel="canonical" href={fullUrl} />

      {/* PWA tags */}
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      <meta name="apple-mobile-web-app-title" content={SITE_NAME} />
      <meta name="theme-color" content="#00ff00" />

      {/* Nostr-specific meta tags */}
      <meta name="nostr:npub" content="" /> {/* Add your npub here */}
    </Helmet>
  );
}

/**
 * Generate SEO props for a post
 */
export function getPostSEO(post: {
  title: string;
  content: string;
  author: string;
  createdAt: number;
  tags?: string[];
}): SEOHeadProps {
  return {
    title: post.title,
    description: post.content.substring(0, 160),
    type: 'article',
    author: post.author,
    publishedTime: new Date(post.createdAt * 1000).toISOString(),
    tags: post.tags || [],
  };
}

/**
 * Generate SEO props for a board
 */
export function getBoardSEO(board: {
  name: string;
  description: string;
}): SEOHeadProps {
  return {
    title: board.name,
    description: board.description,
    type: 'website',
  };
}
