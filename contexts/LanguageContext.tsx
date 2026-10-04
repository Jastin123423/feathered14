import React, { createContext, useContext, useState, ReactNode } from 'react';
import { TRANSLATIONS } from '../constants';

interface LanguageContextType {
    language: string;
    setLanguage: (lang: string) => void;
    t: (key: string, params?: Record<string, string>) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider = ({ children }: { children?: ReactNode }) => {
    const [language, setLanguage] = useState('en');

    const t = (key: string, params?: Record<string, string>) => {
        let text = TRANSLATIONS[language][key] || TRANSLATIONS['en'][key] || key;
        if (params) {
            Object.keys(params).forEach(param => {
                text = text.replace(`{${param}}`, params[param]);
            });
        }
        return text;
    };

    return (
        <LanguageContext.Provider value={{ language, setLanguage, t }}>
            {children}
        </LanguageContext.Provider>
    );
};

export const useLanguage = () => {
    const context = useContext(LanguageContext);
    if (!context) throw new Error('useLanguage must be used within a LanguageProvider');
    return context;
};