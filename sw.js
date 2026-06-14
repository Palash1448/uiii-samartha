const CACHE_NAME = 'samartha-craft-v1';
const IMAGES_CACHE = 'images-v1';

// URLs to cache on install
const STATIC_URLS = [
  '/',
  '/manifest.json',
  // Add critical CSS and JS files here
];

// Install event - cache static resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_URLS))
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== IMAGES_CACHE) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - serve cached content and implement image caching strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Handle image requests with stale-while-revalidate strategy
  if (request.destination === 'image' || 
      url.pathname.match(/\.(jpg|jpeg|png|gif|webp|avif)$/i) ||
      url.hostname.includes('firebasestorage.googleapis.com') ||
      url.hostname.includes('storage.googleapis.com')) {
    
    event.respondWith(
      caches.open(IMAGES_CACHE).then(async (cache) => {
        const cachedResponse = await cache.match(request);
        
        if (cachedResponse) {
          // Return cached image immediately and update cache in background
          fetch(request).then((response) => {
            if (response.status === 200) {
              cache.put(request, response.clone());
            }
          }).catch(() => {
            // Ignore network errors during background update
          });
          return cachedResponse;
        } else {
          // No cached version, fetch from network
          try {
            const response = await fetch(request);
            if (response.status === 200) {
              cache.put(request, response.clone());
            }
            return response;
          } catch (error) {
            // Return a fallback image or create a simple placeholder
            return createImagePlaceholder();
          }
        }
      })
    );
    return;
  }

  // Handle other requests with network-first strategy
  if (request.method === 'GET') {
    event.respondWith(
      fetch(request).then((response) => {
        // Cache successful responses
        if (response.status === 200 && request.url.startsWith(self.location.origin)) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      }).catch(() => {
        // Fallback to cache
        return caches.match(request);
      })
    );
  }
});

// Helper function to create image placeholder
function createImagePlaceholder() {
  const svg = `
    <svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#f1f5f9"/>
      <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="14" fill="#64748b" text-anchor="middle" dy=".3em">
        Image unavailable
      </text>
    </svg>
  `;
  
  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'no-cache'
    }
  });
}

// Listen for messages from the main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'PRELOAD_IMAGES') {
    const imageUrls = event.data.urls;
    preloadImages(imageUrls);
  }
});

// Preload critical images
async function preloadImages(urls) {
  const cache = await caches.open(IMAGES_CACHE);
  
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (response.status === 200) {
        await cache.put(url, response);
      }
    } catch (error) {
      console.log(`Failed to preload image: ${url}`);
    }
  }
}