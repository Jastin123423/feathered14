// AppRouter.tsx
import React, { useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import App from './App';
import ScrollRestoration from './components/ScrollRestoration';
import SplashScreen from './components/SplashScreen';

export default function AppRouter() {
  const [showSplash, setShowSplash] = useState(() => {
    // Show splash on initial page load per session
    try {
      return !sessionStorage.getItem('feathered_splash_seen');
    } catch {
      return true;
    }
  });

  const handleSplashFinish = () => {
    try {
      sessionStorage.setItem('feathered_splash_seen', 'true');
    } catch {
      // ignore
    }
    setShowSplash(false);
  };

  return (
    <>
      {showSplash && <SplashScreen onFinish={handleSplashFinish} duration={1800} />}
      <ScrollRestoration />
      <Routes>
        {/* Main routes */}
        <Route path="/" element={<App initialView="home" />} />
        <Route path="/feed" element={<App initialView="home" />} />
        
        {/* Legal Pages */}
        <Route path="/privacy" element={<App initialView="privacy" />} />
        <Route path="/terms" element={<App initialView="terms" />} />
        
        {/* Settings & Support */}
        <Route path="/settings" element={<App initialView="settings" />} />
        <Route path="/help" element={<App initialView="help" />} />
        
        {/* Main Features */}
        <Route path="/reels" element={<App initialView="reels" />} />
        <Route path="/marketplace" element={<App initialView="marketplace" />} />
        <Route path="/groups" element={<App initialView="groups" />} />
        <Route path="/music" element={<App initialView="music" />} />
        <Route path="/events" element={<App initialView="events" />} />
        <Route path="/notifications" element={<App initialView="notifications" />} />
        <Route path="/messages" element={<App initialView="messages" />} />
        <Route path="/profiles" element={<App initialView="profiles" />} />
        <Route path="/story-feed" element={<App initialView="story-feed" />} />
        <Route path="/birthdays" element={<App initialView="birthdays" />} />
        <Route path="/memories" element={<App initialView="memories" />} />
        <Route path="/saved" element={<App initialView="saved-posts" />} />
        <Route path="/saved-posts" element={<App initialView="saved-posts" />} />
        <Route path="/tools" element={<App initialView="tools" />} />
        <Route path="/ads" element={<App initialView="ads" />} />
        <Route path="/brands" element={<App initialView="brands" />} />
        
        {/* Profile Routes */}
        <Route path="/profile/:userId" element={<App initialView="profile" />} />
        <Route path="/@:username" element={<App initialView="profile" />} />
        
        {/* Deep Link Routes */}
        <Route path="/post/:postId" element={<App initialView="post" />} />
        <Route path="/p/:postId" element={<App initialView="post" />} />
        <Route path="/reel/:reelId" element={<App initialView="reel" />} />
        <Route path="/r/:reelId" element={<App initialView="reel" />} />
        <Route path="/group/:groupId" element={<App initialView="group" />} />
        <Route path="/g/:groupId" element={<App initialView="group" />} />
        <Route path="/event/:eventId" element={<App initialView="event" />} />
        <Route path="/e/:eventId" element={<App initialView="event" />} />
        <Route path="/music/:musicId" element={<App initialView="music-item" />} />
        <Route path="/m/:musicId" element={<App initialView="music-item" />} />
        <Route path="/product/:productId" element={<App initialView="product" />} />
        
        {/* Group Posts */}
        <Route path="/group/:groupId/post/:postId" element={<App initialView="group-post" />} />
        <Route path="/gp/:groupId/:postId" element={<App initialView="group-post" />} />
        
        {/* Catch all - redirect to home */}
        <Route path="*" element={<App initialView="home" />} />
      </Routes>
    </>
  );
}
