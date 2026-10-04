import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { User } from '../types';
import { getApiBaseUrl } from '../utils/api';

/* =========================
   API Helpers
========================= */

const API_BASE = getApiBaseUrl();

type AuthResponse = {
  success?: boolean;
  token?: string;
  user?: any;
  error?: string;
};

async function requestJSON(path: string, options: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text || `Request failed: ${res.status}` };
  }

  if (!res.ok) {
    throw new Error(data?.error || `Request failed: ${res.status}`);
  }

  return data;
}

function saveAuth(auth: { token?: string; user?: any }) {
  if (auth.token) {
    localStorage.setItem('token', auth.token);
    localStorage.setItem('unera_token', auth.token);
  }
  if (auth.user) {
    localStorage.setItem('user', JSON.stringify(auth.user));
    localStorage.setItem('unera_user', JSON.stringify(auth.user));

    const userId = auth.user.id ?? auth.user.user_id;
    if (userId) {
      localStorage.setItem('user_id', String(userId));
      localStorage.setItem('unera_user_id', String(userId));
    }
  }
}

async function apiLogin(email: string, password: string): Promise<AuthResponse> {
  return requestJSON('/api/users/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

async function apiSignup(payload: {
  username: string;
  email: string;
  password: string;
  birth_date?: string;
  gender?: string;
  nationality?: string;
  location?: string;
}): Promise<AuthResponse> {
  return requestJSON('/api/users/signup', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/* =========================
   Forgot Password (UI only)
========================= */

interface ForgotPasswordProps {
  onBackToLogin: () => void;
}

export const ForgotPassword: React.FC<ForgotPasswordProps> = ({ onBackToLogin }) => {
  const [email, setEmail] = useState('');
  const [isSent, setIsSent] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim()) {
      setIsSent(true);
    }
  };

  return (
    <div className="min-h-screen bg-[#050B18] flex flex-col items-center justify-center px-4 py-8 animate-fade-in">
      <div className="w-full max-w-[400px] flex flex-col gap-6">
        {/* Brand */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <i className="fas fa-globe-americas text-[#1877F2] text-[40px]"></i>
            <h1 className="text-[40px] font-bold bg-gradient-to-r from-[#1877F2] to-[#1D8AF2] text-transparent bg-clip-text">
              UNERA
            </h1>
          </div>
          <h2 className="text-[24px] font-bold text-[#F8FAFC] mt-4">Find Your Account</h2>
          <p className="text-[#94A3B8] text-[15px] mt-1">
            Enter your email to search for your account.
          </p>
        </div>

        {isSent ? (
          <div className="text-center flex flex-col gap-4">
            <i className="fas fa-check-circle text-5xl text-green-500"></i>
            <h3 className="text-xl font-bold text-[#F8FAFC]">Reset Link Sent!</h3>
            <p className="text-[#94A3B8] text-sm">
              If an account with <strong className="text-[#F8FAFC]">{email}</strong> exists,
              a reset link has been sent. Check your inbox and spam folder.
            </p>
            <button
              onClick={onBackToLogin}
              className="w-full bg-[#1E293B] hover:bg-[#334155] text-white font-bold text-[17px] py-3 rounded-md transition-colors"
            >
              Back to Login
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              type="email"
              placeholder="Email address"
              className="w-full bg-[#1E293B] border border-[#1E293B] rounded-md px-4 py-3.5 text-[17px] text-[#F8FAFC] placeholder-[#94A3B8] focus:outline-none focus:border-[#1877F2]"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <div className="flex gap-2 mt-1">
              <button
                type="button"
                onClick={onBackToLogin}
                className="w-full bg-[#1E293B] hover:bg-[#334155] text-white font-bold text-[17px] py-3 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="w-full bg-[#1877F2] hover:bg-[#166FE5] text-white font-bold text-[17px] py-3 rounded-md transition-colors"
              >
                Send Reset Link
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

/* =========================
   Login (REAL API)
========================= */

interface LoginProps {
  onNavigateToRegister: () => void;
  onNavigateToForgotPassword: () => void;
  onClose: () => void;
  onLoggedIn?: (user: any) => void;
}

export const Login: React.FC<LoginProps> = ({
  onNavigateToRegister,
  onNavigateToForgotPassword,
  onClose,
  onLoggedIn,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { t, setLanguage, language } = useLanguage();

  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiLogin(email.trim(), password);
      saveAuth(res);
      try {
        (window as any).uneraRegisterPushToken?.();
      } catch {}
      onLoggedIn?.(res.user);
      setTimeout(() => {
        window.location.href = '/';
      }, 300);
    } catch (err: any) {
      setError(err?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050B18] flex flex-col relative animate-fade-in">
      {/* Close */}
      <div
        className="absolute top-4 right-4 w-10 h-10 bg-[#1E293B] rounded-full flex items-center justify-center cursor-pointer hover:bg-[#334155] transition-colors z-50"
        onClick={onClose}
        title="Continue as Guest"
      >
        <i className="fas fa-times text-[#F8FAFC] text-xl"></i>
      </div>

      {/* Center content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-3">
            <i className="fas fa-globe-americas text-[#1877F2] text-[44px]"></i>
            <h1 className="text-[44px] font-bold bg-gradient-to-r from-[#1877F2] to-[#1D8AF2] text-transparent bg-clip-text tracking-tight">
              UNERA
            </h1>
          </div>
          <p className="text-[#94A3B8] text-[17px] max-w-[400px]">
            {t('tagline')}
          </p>
        </div>

        {/* Form */}
        <div className="w-full max-w-[400px] flex flex-col gap-4">
          {error && (
            <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded text-sm text-center">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              type="email"
              placeholder="Email address"
              className="w-full bg-[#1E293B] border border-[#1E293B] rounded-md px-4 py-3.5 text-[17px] text-[#F8FAFC] placeholder-[#94A3B8] focus:outline-none focus:border-[#1877F2]"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />

            <input
              type="password"
              placeholder="Password"
              className="w-full bg-[#1E293B] border border-[#1E293B] rounded-md px-4 py-3.5 text-[17px] text-[#F8FAFC] placeholder-[#94A3B8] focus:outline-none focus:border-[#1877F2]"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#1877F2] hover:bg-[#166FE5] disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold text-[18px] py-3 rounded-md transition-colors"
            >
              {loading ? 'Logging in...' : t('login_btn')}
            </button>
          </form>

          <div className="text-center">
            <span
              onClick={onNavigateToForgotPassword}
              className="text-[#1877F2] text-[14px] hover:underline cursor-pointer"
            >
              {t('forgot_password')}
            </span>
          </div>

          <div className="border-b border-[#1E293B] my-1"></div>

          <button
            onClick={onNavigateToRegister}
            className="w-full bg-[#42B72A] hover:bg-[#36A420] text-white font-bold text-[17px] py-3 rounded-md transition-colors"
          >
            {t('create_new_account')}
          </button>
        </div>
      </div>

      {/* Guest hint */}
      <div className="text-center text-xs text-[#94A3B8] pb-4 px-4">
        <p>
          Login to comment, like, and share posts.{' '}
          <span className="text-[#F8FAFC] font-bold cursor-pointer hover:underline" onClick={onClose}>
            Continue as Guest
          </span>{' '}
          to view.
        </p>
      </div>

      {/* Language switcher */}
      <div className="pt-4 pb-6 border-t border-[#1E293B] w-full">
        <div className="flex flex-wrap justify-center gap-4 text-sm text-[#B0B3B8]">
          <span
            className={`cursor-pointer hover:underline ${language === 'en' ? 'font-bold text-[#E4E6EB]' : ''}`}
            onClick={() => setLanguage('en')}
          >
            English (US)
          </span>
          <span
            className={`cursor-pointer hover:underline ${language === 'sw' ? 'font-bold text-[#E4E6EB]' : ''}`}
            onClick={() => setLanguage('sw')}
          >
            Kiswahili
          </span>
          <span
            className={`cursor-pointer hover:underline ${language === 'fr' ? 'font-bold text-[#E4E6EB]' : ''}`}
            onClick={() => setLanguage('fr')}
          >
            Français (France)
          </span>
          <span
            className={`cursor-pointer hover:underline ${language === 'es' ? 'font-bold text-[#E4E6EB]' : ''}`}
            onClick={() => setLanguage('es')}
          >
            Español
          </span>
        </div>
      </div>
    </div>
  );
};

/* =========================
   Register (REAL API)
========================= */

interface RegisterProps {
  onBackToLogin: () => void;
  onRegistered?: (user: any) => void;
}

interface CountryData {
  name: { common: string };
  flag: string;
}

export const Register: React.FC<RegisterProps> = ({ onBackToLogin, onRegistered }) => {
  const [firstName, setFirstName] = useState('');
  const [surname, setSurname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [nationality, setNationality] = useState('Tanzania');
  const [countryInput, setCountryInput] = useState('🇹🇿 Tanzania');
  const [countrySearch, setCountrySearch] = useState('');
  const [showCountryList, setShowCountryList] = useState(false);
  const countryRef = useRef<HTMLDivElement>(null);

  const [region, setRegion] = useState('');

  const [day, setDay] = useState(new Date().getDate());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear() - 18);
  const [gender, setGender] = useState('Female');

  const [countries, setCountries] = useState<CountryData[]>([]);
  const [isLoadingCountries, setIsLoadingCountries] = useState(true);

  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const { t } = useLanguage();

  useEffect(() => {
    fetch('https://restcountries.com/v3.1/all?fields=name,flag')
      .then((res) => res.json())
      .then((data) => {
        const sorted = data.sort((a: CountryData, b: CountryData) =>
          a.name.common.localeCompare(b.name.common)
        );
        setCountries(sorted);
        setIsLoadingCountries(false);
      })
      .catch(() => {
        setIsLoadingCountries(false);
      });
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (countryRef.current && !countryRef.current.contains(event.target as Node)) {
        setShowCountryList(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredCountries = useMemo(() => {
    if (!countrySearch) return countries;
    return countries.filter((c) => c.name.common.toLowerCase().includes(countrySearch.toLowerCase()));
  }, [countries, countrySearch]);

  const birth_date = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    const username = surname.trim() ? `${firstName.trim()} ${surname.trim()}` : firstName.trim();
    if (!username) {
      setError('Please enter your name.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiSignup({
        username,
        email: email.trim(),
        password,
        nationality,
        location: region,
        birth_date,
        gender,
      });

      saveAuth(res);
      try {
        (window as any).uneraRegisterPushToken?.();
      } catch {}
      onRegistered?.(res.user);
      setTimeout(() => {
        window.location.href = '/';
      }, 300);
    } catch (err: any) {
      setError(err?.message || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const years = Array.from({ length: 100 }, (_, i) => new Date().getFullYear() - i);

  return (
    <div className="min-h-screen bg-[#050B18] flex flex-col items-center justify-center px-4 py-8 animate-fade-in">
      <div className="w-full max-w-[400px] flex flex-col gap-6">
        {/* Brand */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <i className="fas fa-globe-americas text-[#1877F2] text-[44px]"></i>
            <h1 className="text-[44px] font-bold bg-gradient-to-r from-[#1877F2] to-[#1D8AF2] text-transparent bg-clip-text">
              UNERA
            </h1>
          </div>
          <h2 className="text-[22px] font-bold text-[#F8FAFC] mt-4">{t('sign_up_header')}</h2>
          <p className="text-[#94A3B8] text-[15px] mt-1">{t('quick_easy')}</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {error && (
            <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded text-sm text-center">
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              placeholder={t('first_name') || 'First name'}
              className="w-1/2 bg-[#1E293B] border border-[#1E293B] rounded-md px-3 py-3 text-[15px] text-[#F8FAFC] placeholder-[#94A3B8] focus:outline-none focus:border-[#1877F2]"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              disabled={loading}
            />
            <input
              type="text"
              placeholder={t('surname_optional') || 'Surname (optional)'}
              className="w-1/2 bg-[#1E293B] border border-[#1E293B] rounded-md px-3 py-3 text-[15px] text-[#F8FAFC] placeholder-[#94A3B8] focus:outline-none focus:border-[#1877F2]"
              value={surname}
              onChange={(e) => setSurname(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="flex flex-col" ref={countryRef}>
            <div className="relative">
              <input
                type="text"
                className="w-full bg-[#1E293B] border border-[#1E293B] rounded-md px-3 py-3 text-[15px] text-[#F8FAFC] placeholder-[#94A3B8] focus:outline-none focus:border-[#1877F2]"
                value={countryInput}
                onChange={(e) => {
                  setCountryInput(e.target.value);
                  setCountrySearch(e.target.value);
                  if (!showCountryList) setShowCountryList(true);
                }}
                onFocus={() => setShowCountryList(true)}
                placeholder="Nationality"
                disabled={loading}
              />

              {showCountryList && (
                <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-[#0B1120] border border-[#1E293B] rounded-md max-h-48 overflow-y-auto">
                  {isLoadingCountries ? (
                    <div className="p-2 text-center text-[#94A3B8]">Loading...</div>
                  ) : filteredCountries.length > 0 ? (
                    filteredCountries.map((c, idx) => (
                      <div
                        key={idx}
                        className="p-2 hover:bg-[#1E293B] cursor-pointer text-[#F8FAFC] flex items-center gap-2"
                        onClick={() => {
                          setNationality(c.name.common);
                          setCountryInput(`${c.flag} ${c.name.common}`);
                          setShowCountryList(false);
                          setCountrySearch('');
                        }}
                      >
                        <span>{c.flag}</span>
                        <span>{c.name.common}</span>
                      </div>
                    ))
                  ) : (
                    <div className="p-2 text-center text-[#94A3B8]">No country found</div>
                  )}
                </div>
              )}
            </div>
          </div>

          <input
            type="text"
            placeholder="Region (e.g. Dar es Salaam)"
            className="w-full bg-[#1E293B] border border-[#1E293B] rounded-md px-3 py-3 text-[15px] text-[#F8FAFC] placeholder-[#94A3B8] focus:outline-none focus:border-[#1877F2]"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            required
            disabled={loading}
          />

          <input
            type="email"
            placeholder="Email address"
            className="w-full bg-[#1E293B] border border-[#1E293B] rounded-md px-3 py-3 text-[15px] text-[#F8FAFC] placeholder-[#94A3B8] focus:outline-none focus:border-[#1877F2]"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
          />

          <input
            type="password"
            placeholder="Password (min 6)"
            minLength={6}
            className="w-full bg-[#1E293B] border border-[#1E293B] rounded-md px-3 py-3 text-[15px] text-[#F8FAFC] placeholder-[#94A3B8] focus:outline-none focus:border-[#1877F2]"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
          />

          <div>
            <label className="text-[12px] text-[#94A3B8] block mb-1">{t('dob') || 'Date of birth'}</label>
            <div className="flex gap-2">
              <select
                value={day}
                onChange={(e) => setDay(Number(e.target.value))}
                className="w-1/3 bg-[#1E293B] border border-[#1E293B] rounded-md p-3 text-[#F8FAFC]"
                disabled={loading}
              >
                {days.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>

              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="w-1/3 bg-[#1E293B] border border-[#1E293B] rounded-md p-3 text-[#F8FAFC]"
                disabled={loading}
              >
                {months.map((m, i) => (
                  <option key={i} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>

              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="w-1/3 bg-[#1E293B] border border-[#1E293B] rounded-md p-3 text-[#F8FAFC]"
                disabled={loading}
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[12px] text-[#94A3B8] block mb-1">{t('gender') || 'Gender'}</label>
            <div className="flex gap-2 justify-between">
              <label className="border border-[#1E293B] rounded-md p-3 flex items-center justify-between flex-1 cursor-pointer bg-[#1E293B]">
                <span className="text-[#F8FAFC]">{t('female')}</span>
                <input
                  type="radio"
                  name="gender"
                  checked={gender === 'Female'}
                  onChange={() => setGender('Female')}
                  disabled={loading}
                />
              </label>

              <label className="border border-[#1E293B] rounded-md p-3 flex items-center justify-between flex-1 cursor-pointer bg-[#1E293B]">
                <span className="text-[#F8FAFC]">{t('male')}</span>
                <input
                  type="radio"
                  name="gender"
                  checked={gender === 'Male'}
                  onChange={() => setGender('Male')}
                  disabled={loading}
                />
              </label>
            </div>
          </div>

          <p className="text-[11px] text-[#94A3B8]">{t('terms_text')}</p>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#00A400] hover:bg-[#008f00] disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold text-[17px] py-3 rounded-md transition-colors mt-1"
          >
            {loading ? 'Creating...' : t('sign_up_btn')}
          </button>

          <div className="text-center mt-2">
            <span className="text-[#1877F2] cursor-pointer hover:underline text-sm" onClick={onBackToLogin}>
              {t('have_account')}
            </span>
          </div>
        </form>
      </div>
    </div>
  );
};
