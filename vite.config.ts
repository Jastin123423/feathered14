import path from 'path';
import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const devPosts: any[] = [];
const devShares: any[] = [];

function apiDevPlugin(): Plugin {
  return {
    name: 'api-dev-middleware',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/')) {
          return next();
        }

        const url = new URL(req.url, 'http://localhost');
        const pathname = url.pathname;

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-id');

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          return res.end();
        }

        if (pathname === '/api/link-preview') {
          const targetUrl = url.searchParams.get('url');
          if (!targetUrl) {
            res.statusCode = 400;
            return res.end(JSON.stringify({ success: false, error: 'URL required' }));
          }

          (async () => {
            try {
              let parsedUrl: URL;
              try {
                parsedUrl = new URL(targetUrl);
              } catch {
                res.statusCode = 400;
                return res.end(JSON.stringify({ success: false, error: 'Invalid URL' }));
              }

              const domain = parsedUrl.hostname.replace('www.', '');

              if (domain.includes('youtube.com') || domain.includes('youtu.be')) {
                let videoId = '';
                if (domain.includes('youtu.be')) {
                  videoId = parsedUrl.pathname.slice(1).split('/')[0];
                } else if (parsedUrl.searchParams.has('v')) {
                  videoId = parsedUrl.searchParams.get('v') || '';
                } else if (parsedUrl.pathname.includes('/shorts/')) {
                  videoId = parsedUrl.pathname.split('/shorts/')[1]?.split('/')[0] || '';
                }

                if (videoId) {
                  let ytTitle = 'YouTube Video';
                  let ytAuthor = 'YouTube';
                  try {
                    const ytRes = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(targetUrl)}&format=json`);
                    if (ytRes.ok) {
                      const ytData: any = await ytRes.json();
                      ytTitle = ytData.title || ytTitle;
                      ytAuthor = ytData.author_name || ytAuthor;
                    }
                  } catch {}

                  return res.end(
                    JSON.stringify({
                      success: true,
                      data: {
                        url: targetUrl,
                        title: ytTitle,
                        description: `Watch on YouTube • ${ytAuthor}`,
                        image: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                        domain: 'youtube.com',
                      },
                    })
                  );
                }
              }

              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 5000);

              const response = await fetch(targetUrl, {
                signal: controller.signal,
                headers: {
                  'User-Agent': 'Mozilla/5.0 (compatible; FacebookExternalHit/1.1; +http://www.facebook.com/externalhit_uatext.php)',
                  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                },
              });
              clearTimeout(timeoutId);

              if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
              }

              const html = await response.text();

              const getMeta = (tag: string) => {
                const r1 = new RegExp(`<meta\\s+[^>]*(?:property|name)=["']${tag}["'][^>]*content=["']([^"']*)["']`, 'i');
                const m1 = html.match(r1);
                if (m1?.[1]) return m1[1];
                const r2 = new RegExp(`<meta\\s+[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${tag}["']`, 'i');
                const m2 = html.match(r2);
                return m2?.[1] || null;
              };

              const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
              const ogTitle = getMeta('og:title');
              const twitterTitle = getMeta('twitter:title');
              const title = ogTitle || twitterTitle || titleMatch?.[1]?.trim() || domain;

              const ogDesc = getMeta('og:description');
              const twitterDesc = getMeta('twitter:description');
              const metaDesc = getMeta('description');
              const description = ogDesc || twitterDesc || metaDesc || `Visit ${domain} for more information.`;

              let ogImage = getMeta('og:image') || getMeta('twitter:image');
              if (ogImage && !ogImage.startsWith('http')) {
                try {
                  ogImage = new URL(ogImage, targetUrl).href;
                } catch {
                  ogImage = null;
                }
              }

              res.statusCode = 200;
              return res.end(
                JSON.stringify({
                  success: true,
                  data: {
                    url: targetUrl,
                    title: title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim(),
                    description: description.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim(),
                    image: ogImage || null,
                    domain,
                  },
                })
              );
            } catch {
              const domain = new URL(targetUrl).hostname.replace('www.', '');
              res.statusCode = 200;
              return res.end(
                JSON.stringify({
                  success: true,
                  data: {
                    url: targetUrl,
                    title: domain,
                    description: `Visit ${domain} for more information.`,
                    image: null,
                    domain,
                  },
                })
              );
            }
          })();
          return;
        }

        if (pathname === '/api/ads/feed' || pathname === '/api/ads/feeds' || pathname === '/api/ads/my') {
          res.statusCode = 200;
          return res.end(JSON.stringify({ ads: [] }));
        }

        if (pathname === '/api/songs') {
          res.statusCode = 200;
          return res.end(
            JSON.stringify({
              songs: [
                {
                  id: 1,
                  uploader_id: 0,
                  title: 'Sample Track',
                  artist_name: 'Artist',
                  cover_image_url:
                    'https://images.unsplash.com/photo-1514525253440-b393452e8d26?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80',
                  audio_url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
                  duration_seconds: 245,
                  genre: 'Music',
                  created_at: new Date().toISOString(),
                  stats: { plays: 0, downloads: 0, shares: 0, likes: 0, reels_use: 0 },
                },
              ],
            })
          );
        }

        if (pathname === '/api/reels') {
          if (req.method === 'POST') {
            res.statusCode = 200;
            return res.end(JSON.stringify({ success: true, id: Date.now() }));
          }
          const videoPosts = devPosts.filter(
            (p) => p.video_url || p.media_type === 'video' || p.type === 'video'
          );
          const reels = videoPosts.map((p) => ({
            id: p.id,
            reel_id: p.id,
            video_url: p.video_url || p.media_url,
            thumbnail_url: p.thumb_url || p.media_meta?.[0]?.thumb || '',
            caption: p.content || '',
            content: p.content || '',
            author: p.user?.name || 'User',
            author_name: p.user?.name || 'User',
            avatar: p.user?.profile_image_url || '',
            avatar_url: p.user?.profile_image_url || '',
            verified: Boolean(p.user?.is_verified),
            created_at: p.created_at,
            likes_count: p.likesCount || 0,
            views: p.views || 0,
          }));
          res.statusCode = 200;
          return res.end(JSON.stringify({ reels }));
        }

        if (pathname === '/api/stories') {
          res.statusCode = 200;
          return res.end(JSON.stringify({ stories: [] }));
        }

        if (pathname === '/api/events') {
          res.statusCode = 200;
          return res.end(JSON.stringify({ events: [] }));
        }

        if (pathname === '/api/posts') {
          if (req.method === 'POST') {
            let body = '';
            req.on('data', (chunk) => {
              body += chunk;
            });
            return req.on('end', () => {
              try {
                const parsed = JSON.parse(body || '{}');
                const newPost = {
                  id: Date.now(),
                  post_id: Date.now(),
                  ...parsed,
                  created_at: new Date().toISOString(),
                };
                devPosts.unshift(newPost);
                res.statusCode = 201;
                return res.end(JSON.stringify({ success: true, post: newPost }));
              } catch (e) {
                res.statusCode = 400;
                return res.end(JSON.stringify({ error: 'Invalid JSON' }));
              }
            });
          }
          res.statusCode = 200;
          return res.end(JSON.stringify(devPosts));
        }

        if (pathname === '/api/feeds') {
          res.statusCode = 200;
          return res.end(JSON.stringify({ feed: devPosts, success: true }));
        }

        if (pathname === '/api/posts/by-user') {
          const parsedUrl = new URL(req.url || '', 'http://localhost');
          const uid = Number(parsedUrl.searchParams.get('userId') || parsedUrl.searchParams.get('user_id') || 0);
          const userPosts = devPosts.filter((p) => !uid || Number(p.user_id) === uid);
          res.statusCode = 200;
          return res.end(JSON.stringify({ success: true, posts: userPosts, data: userPosts, results: userPosts }));
        }

        if (pathname === '/api/shares' || pathname === '/api/post_shares') {
          res.statusCode = 200;
          return res.end(JSON.stringify({ success: true, shares: devShares, data: devShares }));
        }

        if (pathname === '/api/products') {
          res.statusCode = 200;
          return res.end(JSON.stringify([]));
        }

        if (pathname === '/api/brands') {
          res.statusCode = 200;
          return res.end(JSON.stringify([]));
        }

        if (pathname === '/api/chats') {
          res.statusCode = 200;
          return res.end(JSON.stringify([]));
        }

        if (pathname === '/api/notifications') {
          res.statusCode = 200;
          return res.end(JSON.stringify([]));
        }

        if (pathname === '/api/upload') {
          res.statusCode = 200;
          return res.end(
            JSON.stringify({
              success: true,
              url: '',
              media_urls: {
                thumb: '',
                feed: '',
                full: '',
              },
              uploaded: {
                thumbnail: { url: '' },
                feed: { url: '' },
                original: { url: '' },
              },
            })
          );
        }

        if (pathname === '/api/reels' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          return req.on('end', () => {
            try {
              const parsed = JSON.parse(body || '{}');
              const newReel = {
                id: Date.now(),
                user_id: parsed.user_id || 1,
                video_url: parsed.video_url || parsed.videoUrl || '',
                thumbnail_url: parsed.thumbnail_url || parsed.thumbnailUrl || '',
                caption: parsed.caption || '',
                song_name: parsed.song_name || 'Original Sound',
                views: 0,
                shares: 0,
                created_at: new Date().toISOString(),
              };
              res.statusCode = 201;
              return res.end(JSON.stringify({ success: true, reel: newReel }));
            } catch {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
          });
        }

        if (pathname.includes('/api/reels/') && pathname.endsWith('/react')) {
          res.statusCode = 200;
          return res.end(JSON.stringify({ success: true, reactions: { love: 1 }, my_reaction: 'love' }));
        }

        if (pathname.includes('/api/reels/') && pathname.endsWith('/share')) {
          const parts = pathname.split('/');
          const reelId = Number(parts[3] || 0);
          res.statusCode = 200;
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          return req.on('end', () => {
            try {
              const parsed = JSON.parse(body || '{}');
              const origReel = parsed.shared_post || parsed.post || devPosts.find((p) => Number(p.id) === reelId) || {
                id: reelId,
                reel_id: reelId,
                type: 'reel',
                media_type: 'video',
                video_url: parsed.video_url || '',
                caption: parsed.caption || '',
              };
              const newSharedPost = {
                id: Date.now(),
                post_id: Date.now(),
                user_id: parsed.user_id || 1,
                content: parsed.message || parsed.content || '',
                description: parsed.message || parsed.content || '',
                message: parsed.message || parsed.content || '',
                feeling: parsed.feeling || undefined,
                location: parsed.location || undefined,
                audience: parsed.audience || 'Public',
                shared_post_id: reelId,
                shared_post: {
                  ...origReel,
                  video_url: origReel.video_url || origReel.media_url,
                  media_url: origReel.media_url || origReel.video_url,
                  description: origReel.description || origReel.content || origReel.caption || '',
                  is_verified: Boolean(origReel.is_verified || origReel.author?.is_verified),
                  verified: Boolean(origReel.is_verified || origReel.author?.is_verified),
                },
                is_verified: false,
                verified: false,
                author: {
                  id: parsed.user_id || 1,
                  name: 'You',
                  username: 'you',
                  is_verified: false,
                  verified: false,
                },
                user: {
                  id: parsed.user_id || 1,
                  name: 'You',
                  username: 'you',
                  is_verified: false,
                  verified: false,
                },
                created_at: new Date().toISOString(),
                shares: 0,
                shares_count: 0,
                likes_count: 0,
                reactions_count: 0,
                comments_count: 0,
              };
              const shareRecord = {
                id: Date.now(),
                post_id: reelId,
                user_id: parsed.user_id || 1,
                destination: parsed.destination || 'feed',
                message: parsed.message || parsed.content || '',
                created_at: new Date().toISOString(),
              };
              devShares.unshift(shareRecord);
              if (parsed.destination === 'feed' || parsed.destination === 'profile') {
                devPosts.unshift(newSharedPost);
              }
              return res.end(JSON.stringify({
                success: true,
                share_id: shareRecord.id,
                post_id: reelId,
                shares: 1,
                shares_count: 1,
                post: newSharedPost,
                shared_post: origReel,
              }));
            } catch {
              return res.end(JSON.stringify({ success: true, shares: 1, shares_count: 1 }));
            }
          });
        }

        // Standard Post Endpoints: React, Reactions, Share, Comments
        if (pathname.startsWith('/api/posts/') && pathname.endsWith('/react')) {
          const parts = pathname.split('/');
          const postId = Number(parts[3] || 0);
          res.statusCode = 200;
          if (req.method === 'POST') {
            let body = '';
            req.on('data', (chunk) => { body += chunk; });
            return req.on('end', () => {
              try {
                const parsed = JSON.parse(body || '{}');
                const rType = parsed.type || parsed.reaction || 'like';
                return res.end(JSON.stringify({
                  success: true,
                  post_id: postId,
                  my_reaction: rType,
                  reaction: rType,
                }));
              } catch {
                return res.end(JSON.stringify({ success: true, my_reaction: 'like' }));
              }
            });
          }
          return res.end(JSON.stringify({ success: true, my_reaction: 'like' }));
        }

        if (pathname.startsWith('/api/posts/') && pathname.endsWith('/reactions')) {
          const parts = pathname.split('/');
          const postId = Number(parts[3] || 0);
          res.statusCode = 200;
          return res.end(JSON.stringify({
            success: true,
            post_id: postId,
            reactions: [
              {
                user_id: 1,
                type: 'like',
                created_at: new Date().toISOString(),
                user: { id: 1, name: 'Alex Rivera', username: 'alex', profile_image_url: null },
              },
            ],
          }));
        }

        if ((pathname.startsWith('/api/posts/') && pathname.endsWith('/share')) || pathname === '/api/posts/share') {
          const parts = pathname.split('/');
          const postId = Number(parts[3] || 0);
          res.statusCode = 200;
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          return req.on('end', () => {
            try {
              const parsed = JSON.parse(body || '{}');
              const origPost = devPosts.find((p) => Number(p.id) === postId) || parsed.shared_post || parsed.post || null;
              const nextShares = (Number(origPost?.shares ?? origPost?.shares_count ?? 0) || 0) + 1;
              if (origPost) {
                origPost.shares = nextShares;
                origPost.shares_count = nextShares;
              }
              const newSharedPost = {
                id: Date.now(),
                post_id: Date.now(),
                user_id: parsed.user_id || 1,
                content: parsed.message || parsed.content || '',
                description: parsed.message || parsed.content || '',
                message: parsed.message || parsed.content || '',
                feeling: parsed.feeling || undefined,
                location: parsed.location || undefined,
                audience: parsed.audience || 'Public',
                shared_post_id: postId,
                shared_post: origPost ? {
                  ...origPost,
                  video_url: origPost.video_url || origPost.media_url,
                  media_url: origPost.media_url || origPost.video_url,
                  thumbnail_url: origPost.thumbnail_url || origPost.cover_url,
                  description: origPost.description || origPost.content || origPost.caption || '',
                  is_verified: Boolean(origPost.is_verified || origPost.author?.is_verified),
                  verified: Boolean(origPost.is_verified || origPost.author?.is_verified),
                } : null,
                is_verified: false,
                verified: false,
                author: {
                  id: parsed.user_id || 1,
                  name: 'You',
                  username: 'you',
                  is_verified: false,
                  verified: false,
                },
                user: {
                  id: parsed.user_id || 1,
                  name: 'You',
                  username: 'you',
                  is_verified: false,
                  verified: false,
                },
                created_at: new Date().toISOString(),
                shares: 0,
                shares_count: 0,
                likes_count: 0,
                reactions_count: 0,
                comments_count: 0,
              };
              const shareRecord = {
                id: Date.now(),
                post_id: postId,
                user_id: parsed.user_id || 1,
                destination: parsed.destination || 'feed',
                message: parsed.message || parsed.content || '',
                created_at: new Date().toISOString(),
              };
              devShares.unshift(shareRecord);

              if (parsed.destination === 'feed' || parsed.destination === 'profile') {
                devPosts.unshift(newSharedPost);
              }
              return res.end(JSON.stringify({
                success: true,
                share_id: shareRecord.id,
                post_id: postId,
                destination: parsed.destination || 'feed',
                shares: nextShares,
                shares_count: nextShares,
                post: newSharedPost,
                shared_post: origPost,
              }));
            } catch {
              return res.end(JSON.stringify({ success: true, shares: 1, shares_count: 1 }));
            }
          });
        }

        if ((pathname.startsWith('/api/stories/') && pathname.endsWith('/share')) || pathname === '/api/stories/share') {
          const parts = pathname.split('/');
          const storyId = Number(parts[3] || 0);
          res.statusCode = 200;
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          return req.on('end', () => {
            try {
              const parsed = JSON.parse(body || '{}');
              const userId = Number(req.headers['x-user-id'] || parsed.user_id || 1);
              const destination = parsed.destination || 'feed';
              const message = parsed.message || parsed.content || '';
              const origStory = parsed.shared_story || parsed.story || parsed.post || {
                id: storyId,
                story_id: storyId,
                type: 'text',
                text_content: 'Story content',
                author: { id: 1, name: 'User', username: 'user' },
              };
              const shareId = Date.now();
              const newSharePost = {
                id: shareId,
                post_id: shareId,
                feed_key: `story_share:${shareId}`,
                source: 'story_share',
                item_type: 'story_share',
                type: 'story_share',
                post_type: 'story_share',
                kind: 'story_share',
                user_id: userId,
                content: message,
                description: message,
                shared_post_id: storyId,
                shared_story_id: storyId,
                shared_story: origStory,
                shared_post: origStory,
                created_at: new Date().toISOString(),
                shares: 0,
                shares_count: 0,
                reactions_count: 0,
                comments_count: 0,
                visibility: 'public',
              };
              if (destination === 'feed' || destination === 'profile') {
                devPosts.unshift(newSharePost);
              }
              devShares.unshift({
                id: shareId,
                story_id: storyId,
                user_id: userId,
                destination,
                message,
                created_at: new Date().toISOString(),
              });
              return res.end(JSON.stringify({
                success: true,
                share_id: shareId,
                post_id: shareId,
                story_id: storyId,
                destination,
                shares: 1,
                shares_count: 1,
                post: newSharePost,
                shared_post: origStory,
                shared_story: origStory,
              }));
            } catch {
              return res.end(JSON.stringify({ success: true, shares: 1, shares_count: 1 }));
            }
          });
        }

        if ((pathname.startsWith('/api/products/') && pathname.endsWith('/share')) || pathname === '/api/products/share') {
          const parts = pathname.split('/');
          const productId = Number(parts[3] || 0);
          res.statusCode = 200;
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          return req.on('end', () => {
            try {
              const parsed = JSON.parse(body || '{}');
              const targetProductId = productId || Number(parsed.product_id || parsed.id || 1);
              const origProduct = parsed.shared_product || parsed.product || {
                id: targetProductId,
                product_id: targetProductId,
                title: 'Featured Product',
                content: 'Top quality product available on marketplace',
                description: 'Top quality product available on marketplace',
                price: 75000,
                main_price: 75000,
                currency: 'TZS',
                location: 'Dar es Salaam',
                images: ['https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=80'],
                media_urls: ['https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=80'],
                author: {
                  id: 2,
                  name: 'Official Store',
                  username: 'officialstore',
                  avatar_url: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=120&auto=format&fit=crop&q=80',
                  profile_image_url: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=120&auto=format&fit=crop&q=80',
                  is_verified: true,
                  verified: true,
                },
                user: {
                  id: 2,
                  name: 'Official Store',
                  username: 'officialstore',
                  avatar_url: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=120&auto=format&fit=crop&q=80',
                  profile_image_url: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=120&auto=format&fit=crop&q=80',
                  is_verified: true,
                  verified: true,
                },
                is_product: true,
                item_type: 'product',
                type: 'product',
                kind: 'product',
              };

              const newSharedProductPost = {
                id: Date.now(),
                post_id: Date.now(),
                product_id: targetProductId,
                user_id: parsed.user_id || 1,
                content: parsed.message || parsed.content || '',
                description: parsed.message || parsed.content || '',
                message: parsed.message || parsed.content || '',
                source: 'share',
                item_type: 'product_share',
                type: 'share',
                post_type: 'product_share',
                shared_post_id: targetProductId,
                shared_product: origProduct,
                shared_post: origProduct,
                is_verified: false,
                verified: false,
                author: {
                  id: parsed.user_id || 1,
                  name: 'You',
                  username: 'you',
                  is_verified: false,
                  verified: false,
                },
                user: {
                  id: parsed.user_id || 1,
                  name: 'You',
                  username: 'you',
                  is_verified: false,
                  verified: false,
                },
                created_at: new Date().toISOString(),
                shares: 1,
                shares_count: 1,
                likes_count: 0,
                reactions_count: 0,
                comments_count: 0,
              };

              const shareRecord = {
                id: Date.now(),
                product_id: targetProductId,
                user_id: parsed.user_id || 1,
                destination: parsed.destination || 'feed',
                message: parsed.message || parsed.content || '',
                created_at: new Date().toISOString(),
              };
              devShares.unshift(shareRecord);

              if (parsed.destination === 'feed' || parsed.destination === 'profile') {
                devPosts.unshift(newSharedProductPost);
              }

              return res.end(JSON.stringify({
                success: true,
                share_id: shareRecord.id,
                product_id: targetProductId,
                shares: 1,
                shares_count: 1,
                post: newSharedProductPost,
                shared_post: origProduct,
                shared_product: origProduct,
              }));
            } catch {
              return res.end(JSON.stringify({ success: true, shares: 1, shares_count: 1 }));
            }
          });
        }


        // Single Post Fetch: GET /api/posts/:id
        if (req.method === 'GET' && /^\/api\/posts\/\d+$/.test(pathname)) {
          const postId = Number(pathname.split('/')[3] || 0);
          const found = devPosts.find((p) => Number(p.id) === postId);
          if (found) {
            res.statusCode = 200;
            return res.end(JSON.stringify({ success: true, post: found }));
          }
          res.statusCode = 404;
          return res.end(JSON.stringify({ success: false, error: 'Post not found' }));
        }

        if (pathname.startsWith('/api/posts/') && (pathname.endsWith('/comments') || pathname.endsWith('/comment'))) {
          const parts = pathname.split('/');
          const postId = Number(parts[3] || 0);
          res.statusCode = 200;
          if (req.method === 'POST') {
            let body = '';
            req.on('data', (chunk) => { body += chunk; });
            return req.on('end', () => {
              try {
                const parsed = JSON.parse(body || '{}');
                return res.end(JSON.stringify({
                  success: true,
                  comment: {
                    id: Date.now(),
                    post_id: postId,
                    text: parsed.text || 'Great post!',
                    user_id: parsed.user_id || 1,
                    created_at: new Date().toISOString(),
                  },
                }));
              } catch {
                return res.end(JSON.stringify({ success: true, comment: { id: Date.now(), text: 'Nice!' } }));
              }
            });
          }
          return res.end(JSON.stringify({ success: true, comments: [] }));
        }

        if (pathname.startsWith('/api/post-comments/')) {
          res.statusCode = 200;
          if (pathname.endsWith('/hide')) {
            let body = '';
            req.on('data', (chunk) => { body += chunk; });
            return req.on('end', () => {
              try {
                const parsed = JSON.parse(body || '{}');
                return res.end(JSON.stringify({ success: true, action: parsed.action || 'hide' }));
              } catch {
                return res.end(JSON.stringify({ success: true }));
              }
            });
          }
          if (pathname.endsWith('/delete') || req.method === 'DELETE') {
            return res.end(JSON.stringify({ success: true }));
          }
          if (pathname.endsWith('/like')) {
            return res.end(JSON.stringify({ success: true, liked_by_me: true, likes_count: 1 }));
          }
          return res.end(JSON.stringify({ success: true }));
        }

        if (pathname === '/api/reel-likes') {
          res.statusCode = 200;
          return res.end(JSON.stringify({ success: true, liked: true, count: 1 }));
        }

        if (pathname === '/api/reel-comments') {
          res.statusCode = 200;
          if (req.method === 'POST') {
            return res.end(
              JSON.stringify({
                success: true,
                comment: {
                  id: Date.now(),
                  text: 'Awesome video!',
                  created_at: new Date().toISOString(),
                },
              })
            );
          }
          return res.end(JSON.stringify({ success: true, comments: [] }));
        }

        if (pathname === '/api/users/moderate') {
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          return req.on('end', () => {
            try {
              const parsed = JSON.parse(body || '{}');
              const action = parsed.action;
              const targetUserId = parsed.user_id;
              if (action === 'verify') {
                return res.end(JSON.stringify({ success: true, action: 'verify', user_id: targetUserId, is_verified: 1 }));
              }
              if (action === 'unverify') {
                return res.end(JSON.stringify({ success: true, action: 'unverify', user_id: targetUserId, is_verified: 0 }));
              }
              if (action === 'suspend') {
                const duration = parsed.duration || 'week';
                const days = duration === 'month' ? 30 : duration === 'week' ? 7 : 36500;
                const expiresAt = (duration === 'indefinite' || duration === 'forever' || duration === 'until_unsuspend')
                  ? '9999-12-31 23:59:59'
                  : new Date(Date.now() + days * 86400000).toISOString().replace('T', ' ').slice(0, 19);
                return res.end(JSON.stringify({ success: true, action: 'suspend', user_id: targetUserId, suspended_until: expiresAt, reason: parsed.reason || 'Suspended', soft_deleted: true }));
              }
              if (action === 'unsuspend') {
                return res.end(JSON.stringify({ success: true, action: 'unsuspend', user_id: targetUserId }));
              }
              if (action === 'delete') {
                return res.end(JSON.stringify({ success: true, action: 'delete', user_id: targetUserId, suspended_until: '9999-12-31 23:59:59', reason: 'Account deleted', soft_deleted: true }));
              }
              if (action === 'make_moderator' || action === 'moderator') {
                return res.end(JSON.stringify({ success: true, action: 'make_moderator', user_id: targetUserId, role: 'moderator' }));
              }
              if (action === 'remove_moderator') {
                return res.end(JSON.stringify({ success: true, action: 'remove_moderator', user_id: targetUserId, role: 'user' }));
              }
              return res.end(JSON.stringify({ success: true, action, user_id: targetUserId }));
            } catch {
              return res.end(JSON.stringify({ success: true }));
            }
          });
        }

        if (pathname === '/api/group-post-comments') {
          if (req.method === 'GET') {
            res.statusCode = 200;
            return res.end(JSON.stringify({ success: true, comments: [] }));
          }
          let body = '';
          req.on('data', chunk => { body += chunk; });
          return req.on('end', () => {
            try {
              const parsed = JSON.parse(body || '{}');
              res.statusCode = 200;
              return res.end(JSON.stringify({
                success: true,
                comment: {
                  id: Date.now(),
                  group_post_id: parsed.post_id,
                  user_id: parsed.user_id,
                  text: parsed.text || '',
                  image_url: parsed.image_url || null,
                  parent_comment_id: parsed.parent_comment_id || null,
                  created_at: new Date().toISOString(),
                }
              }));
            } catch {
              res.statusCode = 200;
              return res.end(JSON.stringify({ success: true }));
            }
          });
        }

        if (pathname === '/api/group-post-comment-likes') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          return req.on('end', () => {
            try {
              const parsed = JSON.parse(body || '{}');
              res.statusCode = 200;
              return res.end(JSON.stringify({
                success: true,
                comment_id: parsed.comment_id,
                liked: true,
                likes_count: 1
              }));
            } catch {
              res.statusCode = 200;
              return res.end(JSON.stringify({ success: true, liked: true, likes_count: 1 }));
            }
          });
        }

        if (pathname === '/api/group-invites') {
          if (req.method === 'GET') {
            res.statusCode = 200;
            return res.end(JSON.stringify({ success: true, invites: [] }));
          }
          if (req.method === 'PUT') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            return req.on('end', () => {
              try {
                const parsed = JSON.parse(body || '{}');
                res.statusCode = 200;
                return res.end(JSON.stringify({
                  success: true,
                  message: `Invite ${parsed.status || 'updated'}`,
                  status: parsed.status,
                  invite_id: url.searchParams.get('id') || parsed.id
                }));
              } catch {
                res.statusCode = 200;
                return res.end(JSON.stringify({ success: true }));
              }
            });
          }
        }

        if (pathname === '/api/users') {
          res.statusCode = 200;
          return res.end(JSON.stringify([]));
        }

        if (pathname === '/api/groups') {
          if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            return req.on('end', () => {
              try {
                const parsed = JSON.parse(body || '{}');
                const newGroup = {
                  id: Date.now(),
                  name: parsed.name,
                  description: parsed.description || '',
                  type: parsed.type || 'public',
                  category: parsed.category || 'general',
                  admin_id: parsed.admin_id,
                  members_count: 1,
                  is_member: true,
                  members: [parsed.admin_id],
                  cover_image: parsed.cover_image,
                  profile_image: parsed.profile_image,
                  created_at: new Date().toISOString()
                };
                res.statusCode = 200;
                return res.end(JSON.stringify({ success: true, group_id: newGroup.id, group: newGroup }));
              } catch {
                res.statusCode = 200;
                return res.end(JSON.stringify({ success: true }));
              }
            });
          }
          res.statusCode = 200;
          return res.end(JSON.stringify([]));
        }

        // Group Events: GET & POST /api/groups/:id/events
        const groupEventsMatch = pathname.match(/^\/api\/groups\/(\d+)\/events\/?$/);
        if (groupEventsMatch) {
          const groupId = Number(groupEventsMatch[1]);
          if (req.method === 'GET') {
            res.statusCode = 200;
            return res.end(JSON.stringify({ success: true, events: [] }));
          }
          if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            return req.on('end', () => {
              try {
                const parsed = JSON.parse(body || '{}');
                let vis = (parsed.visibility || 'group').toLowerCase();
                if (vis === 'worldwide' || vis === 'targeted' || !vis) vis = 'group';
                const newEvent = {
                  id: Date.now(),
                  group_id: groupId,
                  title: parsed.title || 'Group Event',
                  description: parsed.description || '',
                  event_date: parsed.event_date || new Date().toISOString(),
                  location: parsed.location || '',
                  cover_url: parsed.cover_url || '',
                  creator_id: parsed.creator_id || 1,
                  creator_name: parsed.creator_name || 'Organizer',
                  created_at: new Date().toISOString(),
                  visibility: vis,
                  attending_count: 0,
                  interested_count: 0,
                  my_status: '',
                };
                res.statusCode = 200;
                return res.end(JSON.stringify({ success: true, event: newEvent }));
              } catch {
                res.statusCode = 200;
                return res.end(JSON.stringify({ success: true }));
              }
            });
          }
        }

        // Group Post Sharing: POST /api/groups/posts/share
        if (pathname === '/api/groups/posts/share' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          return req.on('end', () => {
            try {
              const parsed = JSON.parse(body || '{}');
              const postId = Number(parsed.post_id || parsed.id || 0);
              const targetGid = Number(parsed.target_group_id || parsed.targetGroupId || parsed.group_id || 0);
              const dest = String(parsed.destination || 'feed').toLowerCase();
              const origPost = parsed.post || parsed.shared_post || devPosts.find(p => Number(p.id) === postId) || null;
              const nextShares = (Number(origPost?.shares ?? origPost?.shares_count ?? 0) || 0) + 1;
              if (origPost) {
                origPost.shares = nextShares;
                origPost.shares_count = nextShares;
              }

              const shareId = Date.now();
              const shareRecord = {
                id: shareId,
                post_id: postId,
                user_id: parsed.user_id || 1,
                destination: dest,
                message: parsed.message || '',
                created_at: new Date().toISOString(),
              };
              devShares.unshift(shareRecord);

              if (dest === 'group') {
                const groupPost = {
                  id: shareId,
                  group_id: targetGid,
                  user_id: parsed.user_id || 1,
                  content: parsed.message || origPost?.content || origPost?.caption || '',
                  media_url: origPost?.media_url || origPost?.video_url || null,
                  media_urls: origPost?.media_urls || [],
                  media_types: origPost?.media_types || [],
                  shared_post_id: postId,
                  shared_from: parsed.source || (origPost?.group_id ? 'group' : 'feed'),
                  shared_group_id: origPost?.group_id || null,
                  shared_group_name: origPost?.group_name || null,
                  shared_by_user_id: parsed.user_id || 1,
                  shared_user_name: 'You',
                  original_owner_name: origPost?.author?.name || origPost?.user?.name || 'User',
                  original_owner_id: origPost?.user_id || origPost?.author?.id || null,
                  original_owner_avatar: origPost?.author?.profile_image_url || origPost?.author?.avatar || null,
                  original_post_content: origPost?.content || origPost?.caption || '',
                  visibility: 'public',
                  created_at: new Date().toISOString(),
                  shares: 0,
                  shares_count: 0,
                  reactions_count: 0,
                  comments_count: 0,
                  author: { id: parsed.user_id || 1, name: 'You' },
                };
                res.statusCode = 200;
                return res.end(JSON.stringify({
                  success: true,
                  share_id: shareId,
                  shares_count: nextShares,
                  shares: nextShares,
                  destination: 'group',
                  target_group_id: targetGid,
                  group_post: groupPost,
                  post: groupPost,
                }));
              }

              // dest === 'feed'
              const newFeedSharedPost = {
                id: shareId,
                post_id: shareId,
                user_id: parsed.user_id || 1,
                content: parsed.message || '',
                shared_post_id: postId,
                shared_post: origPost,
                is_group_post: true,
                group_id: Number(parsed.group_id || origPost?.group_id || 0),
                group_name: origPost?.group_name || 'Group',
                source: 'group_post',
                item_type: 'group_post',
                feed_key: `group_post_share:${shareId}`,
                created_at: new Date().toISOString(),
                shares: 0,
                shares_count: 0,
                likes_count: 0,
                reactions_count: 0,
                comments_count: 0,
                author: { id: parsed.user_id || 1, name: 'You' },
              };
              devPosts.unshift(newFeedSharedPost);

              res.statusCode = 200;
              return res.end(JSON.stringify({
                success: true,
                message: 'Shared successfully',
                share_id: shareId,
                share_count: nextShares,
                shares: nextShares,
                shares_count: nextShares,
                destination: 'feed',
                post: newFeedSharedPost,
              }));
            } catch {
              res.statusCode = 200;
              return res.end(JSON.stringify({ success: true, destination: 'feed' }));
            }
          });
        }

        // Group Event RSVP: POST /api/group-events/:id/attend & /api/group-events/:id/interested
        const groupEventAttendMatch = pathname.match(/^\/api\/group-events\/(\d+)\/attend\/?$/);
        if (groupEventAttendMatch && req.method === 'POST') {
          const eventId = Number(groupEventAttendMatch[1]);
          let body = '';
          req.on('data', chunk => { body += chunk; });
          return req.on('end', () => {
            try {
              const parsed = JSON.parse(body || '{}');
              res.statusCode = 200;
              return res.end(JSON.stringify({
                success: true,
                action: parsed.action || 'attend',
                event_id: eventId,
                attending_count: parsed.action === 'remove' ? 0 : 1
              }));
            } catch {
              res.statusCode = 200;
              return res.end(JSON.stringify({ success: true }));
            }
          });
        }

        const groupEventInterestedMatch = pathname.match(/^\/api\/group-events\/(\d+)\/interested\/?$/);
        if (groupEventInterestedMatch && req.method === 'POST') {
          const eventId = Number(groupEventInterestedMatch[1]);
          let body = '';
          req.on('data', chunk => { body += chunk; });
          return req.on('end', () => {
            try {
              const parsed = JSON.parse(body || '{}');
              res.statusCode = 200;
              return res.end(JSON.stringify({
                success: true,
                action: parsed.action || 'interested',
                event_id: eventId,
                interested_count: parsed.action === 'remove' ? 0 : 1
              }));
            } catch {
              res.statusCode = 200;
              return res.end(JSON.stringify({ success: true }));
            }
          });
        }

        if (pathname === '/api/group-members') {
          if (req.method === 'GET') {
            res.statusCode = 200;
            return res.end(JSON.stringify({ success: true, members: [] }));
          }
          if (req.method === 'PATCH') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            return req.on('end', () => {
              try {
                const parsed = JSON.parse(body || '{}');
                const action = url.searchParams.get('action') || parsed.action || '';
                res.statusCode = 200;
                return res.end(JSON.stringify({ success: true, action, ...parsed }));
              } catch {
                res.statusCode = 200;
                return res.end(JSON.stringify({ success: true }));
              }
            });
          }
          if (req.method === 'DELETE') {
            res.statusCode = 200;
            return res.end(JSON.stringify({ success: true, message: 'Member removed' }));
          }
        }

        if (pathname.startsWith('/api/user-follows')) {
          res.statusCode = 200;
          return res.end(JSON.stringify({ followers: [], following: [] }));
        }

        res.statusCode = 200;
        return res.end(JSON.stringify({ success: true, data: [] }));
      });
    },
  };
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), apiDevPlugin()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
