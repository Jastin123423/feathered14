import React, { useState, useEffect } from 'react';
import FeatheredLogo from './FeatheredLogo';

interface SplashScreenProps {
  onFinish?: () => void;
  duration?: number;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  onFinish,
  duration = 1800,
}) => {
  const [fadingOut, setFadingOut] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const fadeTimer = setTimeout(() => {
      setFadingOut(true);
    }, Math.max(duration - 400, 800));

    const removeTimer = setTimeout(() => {
      setVisible(false);
      onFinish?.();
    }, duration);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, [duration, onFinish]);

  if (!visible) return null;

  return (
    <div
      id="feathered-splash-screen"
      onClick={() => {
        setFadingOut(true);
        setTimeout(() => {
          setVisible(false);
          onFinish?.();
        }, 300);
      }}
      className={`fixed inset-0 z-[99999] flex flex-col items-center justify-between py-16 px-6 bg-[#070A12] select-none transition-opacity duration-500 ease-out cursor-pointer ${
        fadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      aria-label="Feathered Splash Screen"
      role="dialog"
      aria-modal="true"
    >
      {/* Top ambient spacer */}
      <div className="w-full h-8" />

      {/* Center Hero: Glowing Feather & Brand Name */}
      <div className="flex flex-col items-center justify-center text-center relative max-w-sm mx-auto">
        {/* Ambient background bloom glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full bg-[#2563EB]/25 blur-3xl pointer-events-none animate-pulse" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-44 h-44 rounded-full bg-[#0EA5E9]/20 blur-2xl pointer-events-none" />

        {/* Feather Logo Icon */}
        <div className="relative mb-8 transform transition-transform duration-700 ease-out scale-100 animate-in fade-in zoom-in-95">
          <div className="w-32 h-32 sm:w-36 sm:h-36 rounded-3xl bg-[#0B0E14] border border-[#1E293B] shadow-[0_0_50px_rgba(37,99,235,0.45)] flex items-center justify-center p-5 relative overflow-hidden">
            {/* Subtle inner radial sheen */}
            <div className="absolute inset-0 bg-radial-gradient from-blue-600/15 via-transparent to-transparent pointer-events-none" />
            
            {/* Glowing Feather vector emblem */}
            <FeatheredLogo className="w-full h-full text-white drop-shadow-[0_0_16px_rgba(255,255,255,0.9)]" glow />
          </div>
        </div>

        {/* Brand Name Typography */}
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-[0.25em] uppercase font-sans drop-shadow-sm select-none">
          Feathered
        </h1>

        {/* Tagline below brand */}
        <p className="mt-3 text-sm sm:text-base font-medium text-[#94A3B8] tracking-wide select-none">
          Connect, Create, Move.
        </p>

        {/* Minimal loading bar */}
        <div className="w-24 h-1 bg-slate-800 rounded-full mt-10 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-[#2563EB] to-[#38BDF8] rounded-full animate-[shimmer_1.4s_infinite_linear] w-full" />
        </div>
      </div>

      {/* Footer / version notice */}
      <div className="text-center text-xs text-[#64748B] font-mono tracking-wider">
        FEATHERED SOCIAL
      </div>
    </div>
  );
};

export default SplashScreen;
