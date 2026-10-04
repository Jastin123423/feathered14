// types/media.ts
export interface ImageVersions {
  placeholder: string;  // 50px blurred (2KB)
  low: string;          // 150px slight blur (8KB)
  high: string;         // 800px sharp (80KB)
  dimensions?: {
    width: number;
    height: number;
  };
}

export interface PreloadConfig {
  threshold?: number;      // Intersection threshold (default: 0.1)
  rootMargin?: string;     // Root margin for preloading (default: '200px')
  priority?: 'high' | 'low' | 'auto';
}

export interface SeamlessImageProps {
  urls: ImageVersions;
  alt: string;
  className?: string;
  aspectRatio?: number;
  priority?: 'high' | 'low' | 'auto';
  onLoad?: () => void;
}
