import React, { useState } from 'react';
import { useIsPostSaved, toggleSavePost } from '../utils/savedPosts';

interface SavePostButtonProps {
  post: any;
  isVideo?: boolean;
  className?: string;
  size?: string;
}

export const SavePostButton: React.FC<SavePostButtonProps> = ({
  post,
  isVideo,
  className = '',
  size = 'text-[20px]',
}) => {
  const isSaved = useIsPostSaved(post?.id);
  const [animating, setAnimating] = useState(false);

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setAnimating(true);
    setTimeout(() => setAnimating(false), 300);
    toggleSavePost(post, isVideo);
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      className={`flex items-center justify-center p-1 rounded-lg hover:bg-[#1E293B]/60 transition-transform focus:outline-none ${
        animating ? 'scale-125' : 'active:scale-110'
      } ${className}`}
      aria-label={isSaved ? 'Remove from saved' : 'Save post'}
      title={isSaved ? 'Saved' : 'Save post'}
    >
      <i
        className={`${
          isSaved
            ? 'fas fa-bookmark text-[#F59E0B]'
            : 'far fa-bookmark text-[#F8FAFC] hover:text-[#F59E0B]'
        } ${size} transition-colors`}
      ></i>
    </button>
  );
};
