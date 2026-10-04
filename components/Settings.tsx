// Settings.tsx
import React, { useState, useRef } from 'react';
import { User } from '../types';

interface SettingsProps {
  currentUser: User | null;
  onClose: () => void;
  onLogout: () => void;
  onUpdateUserDetails: (data: Partial<User>) => void;
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  onDeleteAccount?: () => Promise<void>; // ✅ NEW: Delete account callback
}

// ============================================================
// CHANGE PASSWORD MODAL
// ============================================================
const ChangePasswordModal: React.FC<{
  onClose: () => void;
  onSubmit: (currentPassword: string, newPassword: string) => Promise<void>;
}> = ({ onClose, onSubmit }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError('');
    setSuccess('');

    if (!currentPassword.trim()) {
      setError('Current password is required');
      return;
    }
    if (!newPassword.trim()) {
      setError('New password is required');
      return;
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (currentPassword === newPassword) {
      setError('New password must be different from current password');
      return;
    }

    setLoading(true);
    try {
      await onSubmit(currentPassword, newPassword);
      setSuccess('Password changed successfully!');
      setTimeout(() => onClose(), 1500);
    } catch (err: any) {
      setError(err?.message || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[150] bg-black/80 flex items-center justify-center p-4 animate-fade-in font-sans">
      <div className="bg-[#0B1120] w-full max-w-[500px] rounded-xl border border-[#1E293B] shadow-2xl">
        <div className="p-4 border-b border-[#1E293B] flex items-center gap-3">
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-[#1E293B] hover:bg-[#334155] flex items-center justify-center flex-shrink-0 transition-colors"
          >
            <i className="fas fa-arrow-left text-[#F8FAFC]"></i>
          </button>
          <h2 className="text-xl font-bold text-[#F8FAFC]">Change Password</h2>
        </div>

        <div className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-red-900/30 border border-red-700/50 rounded-lg flex items-center gap-2">
              <i className="fas fa-exclamation-circle text-red-400"></i>
              <span className="text-red-300 text-sm">{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3 bg-green-900/30 border border-green-700/50 rounded-lg flex items-center gap-2">
              <i className="fas fa-check-circle text-green-400"></i>
              <span className="text-green-300 text-sm">{success}</span>
            </div>
          )}

          <div>
            <label className="text-[#F8FAFC] font-semibold text-sm block mb-2">
              Current Password
            </label>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                className="w-full bg-[#1E293B] border border-[#1E293B] rounded-lg py-3 px-4 pr-12 text-[#F8FAFC] outline-none focus:border-[#1877F2] transition-colors"
                placeholder="Enter current password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
              <button
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#F8FAFC] transition-colors"
              >
                <i className={`fas ${showCurrent ? 'fa-eye-slash' : 'fa-eye'}`}></i>
              </button>
            </div>
          </div>

          <div>
            <label className="text-[#F8FAFC] font-semibold text-sm block mb-2">
              New Password
            </label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                className="w-full bg-[#1E293B] border border-[#1E293B] rounded-lg py-3 px-4 pr-12 text-[#F8FAFC] outline-none focus:border-[#1877F2] transition-colors"
                placeholder="Enter new password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <button
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#F8FAFC] transition-colors"
              >
                <i className={`fas ${showNew ? 'fa-eye-slash' : 'fa-eye'}`}></i>
              </button>
            </div>
            <p className="text-[#94A3B8] text-xs mt-1">Minimum 6 characters</p>
          </div>

          <div>
            <label className="text-[#F8FAFC] font-semibold text-sm block mb-2">
              Confirm New Password
            </label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                className="w-full bg-[#1E293B] border border-[#1E293B] rounded-lg py-3 px-4 pr-12 text-[#F8FAFC] outline-none focus:border-[#1877F2] transition-colors"
                placeholder="Re-enter new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              <button
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#F8FAFC] transition-colors"
              >
                <i className={`fas ${showConfirm ? 'fa-eye-slash' : 'fa-eye'}`}></i>
              </button>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-[#1E293B]">
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full bg-[#1877F2] hover:bg-[#166FE5] disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-lg font-bold transition-colors active:scale-[0.98]"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <i className="fas fa-spinner fa-spin"></i>
                Changing Password...
              </span>
            ) : (
              'Save Changes'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// DELETE ACCOUNT MODAL (NEW)
// ============================================================
const DeleteAccountModal: React.FC<{
  onClose: () => void;
  onConfirm: () => Promise<void>;
  userEmail?: string;
}> = ({ onClose, onConfirm, userEmail }) => {
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'confirm' | 'password'>('confirm');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleConfirm = async () => {
    setError('');
    
    if (step === 'confirm') {
      if (confirmText !== 'DELETE') {
        setError('Please type "DELETE" to confirm');
        return;
      }
      setStep('password');
      return;
    }
    
    if (step === 'password') {
      if (!password.trim()) {
        setError('Please enter your password to confirm deletion');
        return;
      }
      
      setLoading(true);
      try {
        await onConfirm();
        // Modal will close automatically after success
      } catch (err: any) {
        setError(err?.message || 'Failed to delete account. Please try again.');
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[150] bg-black/80 flex items-center justify-center p-4 animate-fade-in font-sans">
      <div className="bg-[#0B1120] w-full max-w-[500px] rounded-xl border border-[#1E293B] shadow-2xl">
        <div className="p-4 border-b border-[#1E293B] flex items-center gap-3 bg-red-900/20">
          <div className="w-10 h-10 rounded-full bg-red-900/50 flex items-center justify-center">
            <i className="fas fa-trash-alt text-red-500 text-lg"></i>
          </div>
          <h2 className="text-xl font-bold text-[#F8FAFC]">Delete Account</h2>
        </div>

        <div className="p-6 space-y-5">
          {step === 'confirm' ? (
            <>
              <div className="p-4 bg-red-900/20 border border-red-700/50 rounded-lg">
                <p className="text-red-400 font-semibold mb-2">⚠️ Warning: This action is irreversible!</p>
                <p className="text-[#94A3B8] text-sm">
                  Deleting your account will permanently remove:
                </p>
                <ul className="text-[#94A3B8] text-sm list-disc list-inside mt-2 space-y-1">
                  <li>All your posts, comments, and reactions</li>
                  <li>Your stories and reels</li>
                  <li>Your messages and conversations</li>
                  <li>Your groups and marketplace listings</li>
                  <li>All your personal data</li>
                </ul>
              </div>
              
              <div>
                <label className="text-[#F8FAFC] font-semibold text-sm block mb-2">
                  Type <span className="text-red-500 font-bold">DELETE</span> to confirm
                </label>
                <input
                  type="text"
                  className="w-full bg-[#1E293B] border border-[#1E293B] rounded-lg py-3 px-4 text-[#F8FAFC] outline-none focus:border-red-500 transition-colors"
                  placeholder="Type DELETE here"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                />
              </div>
            </>
          ) : (
            <>
              <div className="p-4 bg-red-900/20 border border-red-700/50 rounded-lg">
                <p className="text-red-400 font-semibold">⚠️ Final Step: Confirm with Password</p>
                <p className="text-[#94A3B8] text-sm mt-1">
                  Please enter your password to permanently delete your account.
                </p>
              </div>
              
              <div>
                <label className="text-[#F8FAFC] font-semibold text-sm block mb-2">
                  Your Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="w-full bg-[#1E293B] border border-[#1E293B] rounded-lg py-3 px-4 pr-12 text-[#F8FAFC] outline-none focus:border-red-500 transition-colors"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#F8FAFC] transition-colors"
                  >
                    <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                  </button>
                </div>
              </div>
            </>
          )}

          {error && (
            <div className="p-3 bg-red-900/30 border border-red-700/50 rounded-lg flex items-center gap-2">
              <i className="fas fa-exclamation-circle text-red-400"></i>
              <span className="text-red-300 text-sm">{error}</span>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-[#1E293B] flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 bg-[#1E293B] hover:bg-[#334155] text-[#F8FAFC] py-3 rounded-lg font-bold transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-lg font-bold transition-colors"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <i className="fas fa-spinner fa-spin"></i>
                Deleting...
              </span>
            ) : step === 'confirm' ? (
              'Confirm Deletion'
            ) : (
              'Permanently Delete Account'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// EDIT PROFILE DETAILS MODAL
// ============================================================
const EditProfileDetailsModal: React.FC<{
  user: User;
  onClose: () => void;
  onSave: (data: Partial<User>) => void;
}> = ({ user, onClose, onSave }) => {
  const [name, setName] = useState((user as any).name || '');
  const [bio, setBio] = useState((user as any).bio || '');
  const [work, setWork] = useState((user as any).work || '');
  const [education, setEducation] = useState((user as any).education || '');
  const [location, setLocation] = useState((user as any).location || '');
  const [website, setWebsite] = useState((user as any).website || '');
  const [gender, setGender] = useState((user as any).gender || '');
  const [birthday, setBirthday] = useState((user as any).birthday || '');
  const [error, setError] = useState('');

  const handleSave = () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    onSave({
      name: name.trim(),
      bio: bio.trim(),
      work: work.trim(),
      education: education.trim(),
      location: location.trim(),
      website: website.trim(),
      gender: gender.trim(),
      birthday: birthday.trim(),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[150] bg-black/80 flex items-center justify-center p-4 animate-fade-in font-sans">
      <div className="bg-[#0B1120] w-full max-w-[600px] rounded-xl border border-[#1E293B] shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-[#1E293B] flex items-center gap-3">
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-[#1E293B] hover:bg-[#334155] flex items-center justify-center flex-shrink-0 transition-colors"
          >
            <i className="fas fa-arrow-left text-[#F8FAFC]"></i>
          </button>
          <h2 className="text-xl font-bold text-[#F8FAFC]">Edit Profile Details</h2>
        </div>

        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {error && (
            <div className="p-3 bg-red-900/30 border border-red-700/50 rounded-lg flex items-center gap-2">
              <i className="fas fa-exclamation-circle text-red-400"></i>
              <span className="text-red-300 text-sm">{error}</span>
            </div>
          )}

          <div>
            <label className="text-[#F8FAFC] font-semibold text-sm block mb-2">
              <i className="fas fa-user w-5 text-center mr-2 text-[#94A3B8]"></i>
              Full Name
            </label>
            <input
              type="text"
              className="w-full bg-[#0F172A] border border-[#1E293B] rounded-lg py-3 px-4 text-[#F8FAFC] outline-none focus:border-[#1877F2] transition-colors"
              placeholder="Your full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="text-[#F8FAFC] font-semibold text-sm block mb-2">
              <i className="fas fa-pen w-5 text-center mr-2 text-[#94A3B8]"></i>
              Bio
            </label>
            <textarea
              className="w-full bg-[#0F172A] border border-[#1E293B] rounded-lg py-3 px-4 text-[#F8FAFC] outline-none focus:border-[#1877F2] transition-colors resize-none"
              rows={3}
              placeholder="Tell people about yourself..."
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={500}
            />
            <p className="text-[#94A3B8] text-xs mt-1">{bio.length}/500 characters</p>
          </div>

          <div className="border-t border-[#1E293B] pt-5">
            <h3 className="text-[#F8FAFC] font-bold text-lg mb-4">
              <i className="fas fa-info-circle text-[#1877F2] mr-2"></i>
              Additional Details
            </h3>

            <div className="mb-4">
              <label className="text-[#F8FAFC] font-semibold text-sm block mb-2">
                <i className="fas fa-briefcase w-5 text-center mr-2 text-[#94A3B8]"></i>
                Work
              </label>
              <input
                type="text"
                className="w-full bg-[#0F172A] border border-[#1E293B] rounded-lg py-3 px-4 text-[#F8FAFC] outline-none focus:border-[#1877F2] transition-colors"
                placeholder="Where do you work?"
                value={work}
                onChange={(e) => setWork(e.target.value)}
              />
            </div>

            <div className="mb-4">
              <label className="text-[#F8FAFC] font-semibold text-sm block mb-2">
                <i className="fas fa-graduation-cap w-5 text-center mr-2 text-[#94A3B8]"></i>
                Education
              </label>
              <input
                type="text"
                className="w-full bg-[#0F172A] border border-[#1E293B] rounded-lg py-3 px-4 text-[#F8FAFC] outline-none focus:border-[#1877F2] transition-colors"
                placeholder="Where did you study?"
                value={education}
                onChange={(e) => setEducation(e.target.value)}
              />
            </div>

            <div className="mb-4">
              <label className="text-[#F8FAFC] font-semibold text-sm block mb-2">
                <i className="fas fa-map-marker-alt w-5 text-center mr-2 text-[#94A3B8]"></i>
                Current City
              </label>
              <input
                type="text"
                className="w-full bg-[#0F172A] border border-[#1E293B] rounded-lg py-3 px-4 text-[#F8FAFC] outline-none focus:border-[#1877F2] transition-colors"
                placeholder="Your current city"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>

            <div className="mb-4">
              <label className="text-[#F8FAFC] font-semibold text-sm block mb-2">
                <i className="fas fa-link w-5 text-center mr-2 text-[#94A3B8]"></i>
                Website
              </label>
              <input
                type="url"
                className="w-full bg-[#0F172A] border border-[#1E293B] rounded-lg py-3 px-4 text-[#F8FAFC] outline-none focus:border-[#1877F2] transition-colors"
                placeholder="https://your-website.com"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </div>

            <div className="mb-4">
              <label className="text-[#F8FAFC] font-semibold text-sm block mb-2">
                <i className="fas fa-venus-mars w-5 text-center mr-2 text-[#94A3B8]"></i>
                Gender
              </label>
              <div className="grid grid-cols-3 gap-2">
                {['Male', 'Female', 'Other'].map((option) => (
                  <button
                    key={option}
                    onClick={() => setGender(option)}
                    className={`py-3 rounded-lg font-semibold text-sm transition-colors ${
                      gender === option
                        ? 'bg-[#1877F2] text-white'
                        : 'bg-[#1E293B] text-[#94A3B8] hover:bg-[#334155] hover:text-[#F8FAFC]'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <label className="text-[#F8FAFC] font-semibold text-sm block mb-2">
                <i className="fas fa-birthday-cake w-5 text-center mr-2 text-[#94A3B8]"></i>
                Birthday
              </label>
              <input
                type="date"
                className="w-full bg-[#0F172A] border border-[#1E293B] rounded-lg py-3 px-4 text-[#F8FAFC] outline-none focus:border-[#1877F2] transition-colors [color-scheme:dark]"
                value={birthday}
                onChange={(e) => setBirthday(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-[#1E293B] bg-[#0B1120] rounded-b-xl">
          <button
            onClick={handleSave}
            className="w-full bg-[#1877F2] hover:bg-[#166FE5] text-white py-3 rounded-lg font-bold transition-colors active:scale-[0.98]"
          >
            Save Details
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// SETTINGS SECTIONS CONFIGURATION
// ============================================================
const ACCOUNT_CENTER_SECTIONS = [
  {
    id: 'password',
    icon: 'fas fa-lock',
    title: 'Password & Security',
    desc: 'Change your password and protect your account',
    color: '#1877F2',
  },
  {
    id: 'email',
    icon: 'fas fa-envelope',
    title: 'Email Address',
    desc: 'Manage your email preferences',
    color: '#45BD62',
  },
  {
    id: 'two-factor',
    icon: 'fas fa-shield-halved',
    title: 'Two-Factor Authentication',
    desc: 'Add an extra layer of security to your account',
    color: '#F7B928',
  },
];

const PROFILE_DETAILS_SECTIONS = [
  {
    id: 'personal-info',
    icon: 'fas fa-id-card',
    title: 'Personal Information',
    desc: 'Edit your name, bio, and basic details',
    color: '#1877F2',
    action: 'edit-profile',
  },
  {
    id: 'work-education',
    icon: 'fas fa-briefcase',
    title: 'Work & Education',
    desc: 'Update your work and education history',
    color: '#45BD62',
    action: 'edit-profile',
  },
  {
    id: 'contact',
    icon: 'fas fa-address-book',
    title: 'Contact Info',
    desc: 'Manage your contact information',
    color: '#F3425F',
    action: 'edit-profile',
  },
  {
    id: 'location',
    icon: 'fas fa-map-marker-alt',
    title: 'Location',
    desc: 'Set your current city and hometown',
    color: '#F7B928',
    action: 'edit-profile',
  },
  {
    id: 'website',
    icon: 'fas fa-globe',
    title: 'Website & Social Links',
    desc: 'Add links to your website and social profiles',
    color: '#0055FF',
    action: 'edit-profile',
  },
];

const OTHER_SECTIONS = [
  {
    id: 'privacy-settings',
    icon: 'fas fa-user-shield',
    title: 'Privacy Settings',
    desc: 'Control who can see your profile and posts',
    color: '#B250B3',
  },
  {
    id: 'notifications',
    icon: 'fas fa-bell',
    title: 'Notification Preferences',
    desc: 'Manage how you receive notifications',
    color: '#E41E3F',
  },
  {
    id: 'blocked',
    icon: 'fas fa-ban',
    title: 'Blocked Users',
    desc: 'View and manage blocked accounts',
    color: '#F3425F',
  },
  {
    id: 'delete-account', // ✅ NEW SECTION
    icon: 'fas fa-trash-alt',
    title: 'Delete Account',
    desc: 'Permanently delete your account and all data',
    color: '#DC3545',
    action: 'delete-account',
  },
];

// ============================================================
// MAIN SETTINGS PAGE
// ============================================================
export const SettingsPage: React.FC<SettingsProps> = ({
  currentUser,
  onClose,
  onLogout,
  onUpdateUserDetails,
  onChangePassword,
  onDeleteAccount,
}) => {
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);

  if (!currentUser) {
    return (
      <div className="w-full min-h-screen bg-[#050B18] font-sans text-[#F8FAFC] flex items-center justify-center">
        <div className="text-center">
          <i className="fas fa-exclamation-triangle text-[#F7B928] text-5xl mb-4"></i>
          <p className="text-[#94A3B8] text-lg">Please log in to access settings</p>
        </div>
      </div>
    );
  }

  const handleSectionClick = (sectionId: string, action?: string) => {
    if (sectionId === 'password') {
      setShowChangePassword(true);
    } else if (action === 'edit-profile') {
      setShowEditProfile(true);
    } else if (sectionId === 'delete-account') {
      setShowDeleteAccount(true);
    }
  };

  const handleDeleteAccountConfirm = async () => {
    if (onDeleteAccount) {
      await onDeleteAccount();
      // The parent component will handle logout and redirect
      onClose();
    }
  };

  return (
    <div className="w-full min-h-screen bg-[#050B18] font-sans text-[#F8FAFC] pb-20">
      {/* Hero Banner */}
      <div className="bg-gradient-to-r from-[#0B1120] via-[#0F172A] to-[#0B1120] py-12 px-4 border-b border-[#1E293B]">
        <div className="max-w-[800px] mx-auto flex items-center gap-4">
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-[#1E293B] hover:bg-[#334155] flex items-center justify-center flex-shrink-0 transition-colors"
          >
            <i className="fas fa-arrow-left text-[#F8FAFC] text-lg"></i>
          </button>
          
          <div className="flex items-center gap-4">
            <img
              src={currentUser.profile_image_url}
              alt={currentUser.name}
              className="w-16 h-16 rounded-full object-cover border-2 border-[#1E293B]"
            />
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-[#F8FAFC]">Settings & Privacy</h1>
              <p className="text-[#94A3B8] text-sm mt-1">
                Manage your account settings and profile information
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-[800px] mx-auto px-4 py-6 space-y-6">
        {/* Account Center Section */}
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-[#1877F2]/20 flex items-center justify-center">
              <i className="fas fa-user-shield text-[#1877F2] text-lg"></i>
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#F8FAFC]">Account Center</h2>
              <p className="text-[#94A3B8] text-sm">Manage your password and account security</p>
            </div>
          </div>

          <div className="bg-[#0B1120] rounded-xl border border-[#1E293B] overflow-hidden">
            {ACCOUNT_CENTER_SECTIONS.map((section, index) => (
              <div
                key={section.id}
                onClick={() => handleSectionClick(section.id)}
                className={`flex items-center gap-4 p-4 hover:bg-[#1E293B] cursor-pointer transition-colors group ${
                  index !== ACCOUNT_CENTER_SECTIONS.length - 1 ? 'border-b border-[#1E293B]' : ''
                }`}
              >
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 transition-colors"
                  style={{ backgroundColor: `${section.color}20` }}
                >
                  <i className={`${section.icon} text-lg`} style={{ color: section.color }}></i>
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="text-[#F8FAFC] font-semibold text-[16px] group-hover:text-white transition-colors">
                    {section.title}
                  </h3>
                  <p className="text-[#94A3B8] text-sm truncate">{section.desc}</p>
                </div>

                <i className="fas fa-chevron-right text-[#94A3B8] group-hover:text-[#F8FAFC] transition-colors"></i>
              </div>
            ))}
          </div>
        </div>

        {/* Profile Details Section */}
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-[#45BD62]/20 flex items-center justify-center">
              <i className="fas fa-user-pen text-[#45BD62] text-lg"></i>
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#F8FAFC]">Profile Details</h2>
              <p className="text-[#94A3B8] text-sm">Edit your name, bio, work, education, and more</p>
            </div>
          </div>

          <div className="bg-[#0B1120] rounded-xl border border-[#1E293B] overflow-hidden">
            {/* Quick Edit All Button */}
            <div
              onClick={() => setShowEditProfile(true)}
              className="flex items-center gap-4 p-4 bg-gradient-to-r from-[#1877F2]/10 to-[#45BD62]/10 hover:from-[#1877F2]/20 hover:to-[#45BD62]/20 cursor-pointer transition-colors border-b border-[#1E293B] group"
            >
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#1877F2] to-[#45BD62] flex items-center justify-center flex-shrink-0 shadow-lg">
                <i className="fas fa-pen-to-square text-white text-lg"></i>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-[#F8FAFC] font-bold text-[16px]">Edit All Profile Details</h3>
                <p className="text-[#94A3B8] text-sm">Update your full profile information in one place</p>
              </div>
              <i className="fas fa-arrow-right text-[#1877F2] group-hover:translate-x-1 transition-transform"></i>
            </div>

            {PROFILE_DETAILS_SECTIONS.map((section, index) => (
              <div
                key={section.id}
                onClick={() => handleSectionClick(section.id, section.action)}
                className={`flex items-center gap-4 p-4 hover:bg-[#1E293B] cursor-pointer transition-colors group ${
                  index !== PROFILE_DETAILS_SECTIONS.length - 1 ? 'border-b border-[#1E293B]' : ''
                }`}
              >
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 transition-colors"
                  style={{ backgroundColor: `${section.color}20` }}
                >
                  <i className={`${section.icon} text-lg`} style={{ color: section.color }}></i>
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="text-[#F8FAFC] font-semibold text-[16px] group-hover:text-white transition-colors">
                    {section.title}
                  </h3>
                  <p className="text-[#94A3B8] text-sm truncate">{section.desc}</p>
                </div>

                <i className="fas fa-chevron-right text-[#94A3B8] group-hover:text-[#F8FAFC] transition-colors"></i>
              </div>
            ))}
          </div>
        </div>

        {/* Other Settings Section - Including Delete Account */}
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-[#B250B3]/20 flex items-center justify-center">
              <i className="fas fa-sliders text-[#B250B3] text-lg"></i>
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#F8FAFC]">More Settings</h2>
              <p className="text-[#94A3B8] text-sm">Privacy, notifications, and account management</p>
            </div>
          </div>

          <div className="bg-[#0B1120] rounded-xl border border-[#1E293B] overflow-hidden">
            {OTHER_SECTIONS.map((section, index) => (
              <div
                key={section.id}
                onClick={() => handleSectionClick(section.id, section.action)}
                className={`flex items-center gap-4 p-4 hover:bg-[#1E293B] cursor-pointer transition-colors group ${
                  index !== OTHER_SECTIONS.length - 1 ? 'border-b border-[#1E293B]' : ''
                } ${
                  section.id === 'delete-account' ? 'hover:bg-red-900/20' : ''
                }`}
              >
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 transition-colors"
                  style={{ backgroundColor: `${section.color}20` }}
                >
                  <i className={`${section.icon} text-lg`} style={{ color: section.color }}></i>
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className={`text-[16px] font-semibold transition-colors ${
                    section.id === 'delete-account' 
                      ? 'text-red-400 group-hover:text-red-300' 
                      : 'text-[#F8FAFC] group-hover:text-white'
                  }`}>
                    {section.title}
                  </h3>
                  <p className="text-[#94A3B8] text-sm truncate">{section.desc}</p>
                </div>

                <i className={`fas fa-chevron-right transition-colors ${
                  section.id === 'delete-account' 
                    ? 'text-red-500 group-hover:text-red-400' 
                    : 'text-[#94A3B8] group-hover:text-[#F8FAFC]'
                }`}></i>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center pt-4 border-t border-[#1E293B]">
          <p className="text-[#94A3B8] text-sm mb-4">UNERA © 2025</p>
          <button
            onClick={onLogout}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-red-900/30 text-red-400 font-semibold hover:bg-red-900/50 transition-colors"
          >
            <i className="fas fa-sign-out-alt"></i>
            Log Out
          </button>
        </div>
      </div>

      {/* Change Password Modal */}
      {showChangePassword && (
        <ChangePasswordModal
          onClose={() => setShowChangePassword(false)}
          onSubmit={onChangePassword}
        />
      )}

      {/* Edit Profile Modal */}
      {showEditProfile && (
        <EditProfileDetailsModal
          user={currentUser}
          onClose={() => setShowEditProfile(false)}
          onSave={onUpdateUserDetails}
        />
      )}

      {/* Delete Account Modal - NEW */}
      {showDeleteAccount && (
        <DeleteAccountModal
          onClose={() => setShowDeleteAccount(false)}
          onConfirm={handleDeleteAccountConfirm}
          userEmail={currentUser.email}
        />
      )}
    </div>
  );
};
