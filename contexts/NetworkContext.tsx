// contexts/NetworkContext.tsx
import React, { createContext, useContext, useEffect, useState } from 'react';

interface NetworkContextType {
  effectiveType: string;
  saveData: boolean;
  isOnline: boolean;
}

const NetworkContext = createContext<NetworkContextType>({
  effectiveType: '4g',
  saveData: false,
  isOnline: true
});

export const useNetwork = () => useContext(NetworkContext);

export const NetworkProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [network, setNetwork] = useState({
    effectiveType: '4g',
    saveData: false,
    isOnline: navigator.onLine
  });

  useEffect(() => {
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      
      const updateNetwork = () => {
        setNetwork({
          effectiveType: connection.effectiveType || '4g',
          saveData: connection.saveData || false,
          isOnline: navigator.onLine
        });
      };
      
      updateNetwork();
      connection.addEventListener('change', updateNetwork);
      
      return () => connection.removeEventListener('change', updateNetwork);
    }
    
    // Fallback for online/offline
    const handleOnline = () => setNetwork(prev => ({ ...prev, isOnline: true }));
    const handleOffline = () => setNetwork(prev => ({ ...prev, isOnline: false }));
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <NetworkContext.Provider value={network}>
      {children}
    </NetworkContext.Provider>
  );
};
