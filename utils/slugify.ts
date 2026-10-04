// utils/slugify.ts
export function slugify(text: string): string {
  if (!text) return '';
  
  return text
    .toLowerCase()
    .trim()
    // Remove special characters
    .replace(/[^\w\s-]/g, '')
    // Replace spaces with hyphens
    .replace(/\s+/g, '-')
    // Remove multiple hyphens
    .replace(/-+/g, '-')
    // Remove leading/trailing hyphens
    .replace(/^-+|-+$/g, '')
    // Limit length
    .substring(0, 60);
}

const BASE_SITE_URL = 'https://featheredsocial.site';

export function generatePostUrl(post: any): string {
  const baseUrl = BASE_SITE_URL;
  const slug = slugify(post.title || post.content || 'post');
  return `${baseUrl}/post/${post.id}/${slug}`;
}

export function generateReelUrl(reel: any): string {
  const baseUrl = BASE_SITE_URL;
  const slug = slugify(reel.caption || reel.song_name || 'reel');
  return `${baseUrl}/reel/${reel.id}/${slug}`;
}

export function generateGroupUrl(group: any): string {
  const baseUrl = BASE_SITE_URL;
  const slug = slugify(group.name);
  return `${baseUrl}/group/${group.id}/${slug}`;
}

export function generateEventUrl(event: any): string {
  const baseUrl = BASE_SITE_URL;
  const slug = slugify(event.title);
  return `${baseUrl}/event/${event.id}/${slug}`;
}

export function generateMusicUrl(song: any): string {
  const baseUrl = BASE_SITE_URL;
  const slug = slugify(`${song.title} by ${song.artist}`);
  return `${baseUrl}/music/${song.id}/${slug}`;
}

export function generateProductUrl(product: any): string {
  const baseUrl = BASE_SITE_URL;
  const slug = slugify(product.title);
  return `${baseUrl}/product/${product.id}/${slug}`;
}
