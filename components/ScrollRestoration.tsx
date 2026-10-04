// components/ScrollRestoration.tsx
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export default function ScrollRestoration() {
  const { pathname } = useLocation();

  useEffect(() => {
    // Scroll to top on route change (like Facebook)
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
