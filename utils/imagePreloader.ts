// utils/imagePreloader.ts
class ImagePreloader {
  private static instance: ImagePreloader;
  private preloadQueue: Map<string, HTMLImageElement> = new Map();
  private loadedImages: Set<string> = new Set();
  private observer: IntersectionObserver;
  
  private constructor() {
    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const img = entry.target as HTMLImageElement;
            const url = img.dataset.highUrl;
            if (url && !this.loadedImages.has(url)) {
              this.preloadHighQuality(url, img);
            }
          }
        });
      },
      {
        rootMargin: '200px',
        threshold: 0.01
      }
    );
  }
  
  static getInstance() {
    if (!ImagePreloader.instance) {
      ImagePreloader.instance = new ImagePreloader();
    }
    return ImagePreloader.instance;
  }
  
  preloadImageSet(urls: { placeholder: string; low: string; high: string }, priority: 'high' | 'low' | 'auto' = 'auto') {
    const key = urls.high;
    
    if (this.loadedImages.has(key)) return;
    
    // Step 1: Load placeholder immediately
    this.loadPlaceholder(urls.placeholder);
    
    // Step 2: Load low quality based on priority
    if (priority === 'high') {
      this.loadLowQuality(urls.low, key);
    } else if (priority === 'low') {
      this.scheduleIdleLoad(() => this.loadLowQuality(urls.low, key));
    } else {
      this.loadLowQuality(urls.low, key);
    }
  }
  
  private loadPlaceholder(url: string) {
    const img = new Image();
    img.src = url;
    img.fetchPriority = 'high';
    img.decode().catch(() => {});
  }
  
  private loadLowQuality(url: string, key: string) {
    if (this.loadedImages.has(key)) return;
    
    const img = new Image();
    img.src = url;
    img.fetchPriority = 'low';
    img.decode()
      .then(() => {
        this.loadedImages.add(key);
      })
      .catch(() => {});
  }
  
  private preloadHighQuality(url: string, targetImg: HTMLImageElement) {
    if (this.loadedImages.has(url)) {
      targetImg.src = url;
      return;
    }
    
    const highImg = new Image();
    highImg.src = url;
    highImg.fetchPriority = 'high';
    highImg.decode()
      .then(() => {
        this.loadedImages.add(url);
        requestAnimationFrame(() => {
          targetImg.src = url;
        });
      })
      .catch(() => {});
  }
  
  private scheduleIdleLoad(callback: () => void) {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(callback, { timeout: 2000 });
    } else {
      setTimeout(callback, 200);
    }
  }
  
  trackImage(img: HTMLImageElement, highUrl: string) {
    img.dataset.highUrl = highUrl;
    this.observer.observe(img);
  }
  
  untrackImage(img: HTMLImageElement) {
    this.observer.unobserve(img);
  }
}

export const imagePreloader = ImagePreloader.getInstance();
