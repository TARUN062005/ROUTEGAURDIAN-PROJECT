import React, { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  User, Shield, Trash2, AlertCircle, Save, Sun, Moon, Monitor,
  Camera, Phone, Calendar, MapPin, Globe, Loader2,
  Lock, Palette, CheckCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

const BASE_URL = import.meta.env.VITE_BACKEND_URL || '';

const SECTIONS = [
  { id: 'appearance',    label: 'Appearance',    Icon: Palette  },
  { id: 'profile',       label: 'Profile',       Icon: User     },
  { id: 'security',      label: 'Security',      Icon: Lock     },
];

const inputStyle = {
  background: '#0B1220',
  border: '1px solid #374151',
  color: '#F9FAFB',
  outline: 'none',
};

const SettingsPage = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name:     user?.name     || '',
    bio:      user?.bio      || '',
    gender:   user?.gender   || '',
    phone:    user?.phone    || '',
    dob:      user?.dob ? String(user.dob).slice(0, 10) : '',
    location: user?.location || '',
    country:  user?.country  || '',
  });

  const [updateLoading, setUpdateLoading] = useState(false);
  const [profileImageFile, setProfileImageFile] = useState(null);
  const [profilePreview, setProfilePreview]     = useState(user?.profileImage || '');
  const [activeSection, setActiveSection] = useState('appearance');

  useEffect(() => {
    if (window.__applyTheme) window.__applyTheme('dark');
    return () => {
      if (profilePreview?.startsWith('blob:')) URL.revokeObjectURL(profilePreview);
    };
  }, []);

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please select a valid image file'); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error('Image too large — max 2 MB'); return; }
    setProfileImageFile(file);
    if (profilePreview?.startsWith('blob:')) URL.revokeObjectURL(profilePreview);
    setProfilePreview(URL.createObjectURL(file));
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    setUpdateLoading(true);
    try {
      const fd = new FormData();
      Object.entries(formData).forEach(([k, v]) => fd.append(k, v || ''));
      if (profileImageFile) fd.append('profileImage', profileImageFile);
      const res = await axios.patch(`${BASE_URL}/api/user/settings`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        withCredentials: true,
      });
      if (res.data?.success) toast.success('Profile updated');
      else toast.error(res.data?.message || 'Update failed');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Update failed');
    } finally {
      setUpdateLoading(false);
    }
  };



  const handleAccountAction = async (type) => {
    const msg = type === 'permanent'
      ? 'This will permanently delete your account and all data. This cannot be undone!'
      : 'This will suspend your account. You can restore access later.';
    if (!window.confirm(msg)) return;
    try {
      await axios.delete(`${BASE_URL}/api/user/account?type=${type}`, { withCredentials: true });
      toast.success(type === 'permanent' ? 'Account deleted' : 'Account suspended');
      logout();
    } catch {
      toast.error('Action failed. Please try again.');
    }
  };

  const card = { background: '#1F2937', border: '1px solid #374151', borderRadius: 16 };
  const cardHeader = { padding: '20px 24px', borderBottom: '1px solid #374151' };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: '#3B82F6' }}>
          Configuration
        </p>
        <h1 className="text-2xl font-black" style={{ color: '#F9FAFB' }}>Settings</h1>
        <p className="text-sm mt-0.5" style={{ color: '#6B7280' }}>
          Manage your profile, appearance, and account preferences.
        </p>
      </div>

      <div className="flex gap-6">
        {/* Left tabs */}
        <div className="flex-shrink-0" style={{ width: 200 }}>
          <nav className="space-y-0.5 sticky top-4">
            {SECTIONS.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setActiveSection(id)}
                className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold text-left transition-all"
                style={{
                  background: activeSection === id ? 'rgba(59,130,246,0.15)' : 'transparent',
                  color: activeSection === id ? '#3B82F6' : '#9CA3AF',
                }}
                onMouseEnter={e => {
                  if (activeSection !== id) {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                    e.currentTarget.style.color = '#F9FAFB';
                  }
                }}
                onMouseLeave={e => {
                  if (activeSection !== id) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = '#9CA3AF';
                  }
                }}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </nav>
        </div>

        {/* Right content */}
        <div className="flex-1 min-w-0 space-y-4">
          <AnimatePresence mode="wait">

            {/* APPEARANCE */}
            {activeSection === 'appearance' && (
              <motion.div key="appearance" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                style={card}>
                <div style={cardHeader}>
                  <h2 className="text-base font-bold" style={{ color: '#F9FAFB' }}>Theme</h2>
                  <p className="text-sm mt-0.5" style={{ color: '#6B7280' }}>
                    RouteGuardian now runs in a premium dark enterprise theme.
                  </p>
                </div>
                <div className="p-6">
                  <div className="rounded-3xl border border-cyan-400/15 bg-cyan-500/8 p-5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(0,194,255,0.12)', border: '1px solid rgba(0,194,255,0.18)' }}>
                        <Moon size={16} style={{ color: '#00E5FF' }} />
                      </div>
                      <div>
                        <p className="text-sm font-bold" style={{ color: '#F9FAFB' }}>Dark theme enforced</p>
                        <p className="text-xs mt-0.5" style={{ color: '#9CA3AF' }}>The interface uses one cohesive visual system across all screens.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* PROFILE */}
            {activeSection === 'profile' && (
              <motion.div key="profile" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                style={card}>
                <div className="flex items-center justify-between" style={cardHeader}>
                  <div>
                    <h2 className="text-base font-bold" style={{ color: '#F9FAFB' }}>Profile Information</h2>
                    <p className="text-sm mt-0.5" style={{ color: '#6B7280' }}>Update your name, photo and personal details.</p>
                  </div>
                  <label className="cursor-pointer group relative">
                    <div
                      className="w-14 h-14 rounded-xl overflow-hidden group-hover:opacity-80 transition-opacity"
                      style={{ border: '2px solid #374151' }}
                    >
                      {profilePreview
                        ? <img src={profilePreview} alt="Profile" className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-lg font-black" style={{ background: '#0B1220', color: '#3B82F6' }}>
                            {user?.name?.charAt(0) || 'U'}
                          </div>
                      }
                    </div>
                    <div
                      className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center"
                      style={{ background: '#3B82F6' }}
                    >
                      <Camera size={10} className="text-white" />
                    </div>
                    <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                  </label>
                </div>

                <form onSubmit={handleUpdate} className="p-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[
                      { label: 'Full Name',     key: 'name',     type: 'text'   },
                      { label: 'Phone',          key: 'phone',    type: 'tel',    placeholder: '+1 (555) 000-0000' },
                      { label: 'Date of Birth',  key: 'dob',      type: 'date'   },
                      { label: 'Gender',         key: 'gender',   type: 'select', options: ['Male', 'Female', 'Other'] },
                      { label: 'City',           key: 'location', type: 'text',   placeholder: 'City, Region' },
                      { label: 'Country',        key: 'country',  type: 'text',   placeholder: 'Country' },
                    ].map((field) => (
                      <div key={field.key}>
                        <label className="block text-xs font-bold mb-1.5" style={{ color: '#6B7280' }}>
                          {field.label}
                        </label>
                        {field.type === 'select' ? (
                          <select
                            value={formData[field.key]}
                            onChange={e => setFormData({ ...formData, [field.key]: e.target.value })}
                            className="w-full px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
                            style={inputStyle}
                          >
                            <option value="">Select…</option>
                            {field.options.map(opt => (
                              <option key={opt} value={opt.toUpperCase()}>{opt}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={field.type}
                            value={formData[field.key]}
                            placeholder={field.placeholder}
                            onChange={e => setFormData({ ...formData, [field.key]: e.target.value })}
                            className="w-full px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
                            style={inputStyle}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="mt-4">
                    <label className="block text-xs font-bold mb-1.5" style={{ color: '#6B7280' }}>Bio</label>
                    <textarea
                      value={formData.bio}
                      rows="3"
                      onChange={e => setFormData({ ...formData, bio: e.target.value })}
                      placeholder="Tell us a bit about yourself…"
                      className="w-full px-4 py-2.5 rounded-xl text-sm font-medium transition-all resize-none"
                      style={inputStyle}
                    />
                  </div>
                  <div className="flex justify-end mt-5">
                    <button
                      type="submit"
                      disabled={updateLoading}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                      style={{ background: '#3B82F6', color: '#fff' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#2563EB'}
                      onMouseLeave={e => e.currentTarget.style.background = '#3B82F6'}
                    >
                      {updateLoading ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                      Save Changes
                    </button>
                  </div>
                </form>
              </motion.div>
            )}



            {/* SECURITY */}
            {activeSection === 'security' && (
              <motion.div key="security" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="space-y-4">
                <div style={card}>
                  <div style={cardHeader}>
                    <h2 className="text-base font-bold" style={{ color: '#F9FAFB' }}>Account</h2>
                    <p className="text-sm mt-0.5" style={{ color: '#6B7280' }}>Manage your account status and data.</p>
                  </div>
                  <div className="p-6 space-y-3">
                    {[
                      { label: 'Email address',  value: user?.email || '—', badge: 'Verified', badgeColor: '#22C55E', badgeBg: 'rgba(34,197,94,0.12)' },
                      { label: 'Account status', value: 'Active and in good standing', badge: 'Active', badgeColor: '#3B82F6', badgeBg: 'rgba(59,130,246,0.12)' },
                    ].map(({ label, value, badge, badgeColor, badgeBg }) => (
                      <div
                        key={label}
                        className="flex items-center justify-between p-4 rounded-xl"
                        style={{ background: '#0B1220', border: '1px solid #374151' }}
                      >
                        <div>
                          <p className="text-sm font-bold" style={{ color: '#F9FAFB' }}>{label}</p>
                          <p className="text-xs mt-0.5" style={{ color: '#6B7280' }}>{value}</p>
                        </div>
                        <span
                          className="text-[9px] font-black uppercase tracking-wide px-2.5 py-1 rounded-full"
                          style={{ background: badgeBg, color: badgeColor }}
                        >
                          {badge}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Danger zone */}
                <div style={{ ...card, border: '1px solid rgba(239,68,68,0.3)' }}>
                  <div
                    className="flex items-center gap-2 px-6 py-4"
                    style={{ background: 'rgba(239,68,68,0.06)', borderBottom: '1px solid rgba(239,68,68,0.2)' }}
                  >
                    <AlertCircle size={15} style={{ color: '#EF4444' }} />
                    <div>
                      <p className="text-sm font-bold" style={{ color: '#EF4444' }}>Danger Zone</p>
                      <p className="text-xs" style={{ color: 'rgba(239,68,68,0.7)' }}>
                        These actions are irreversible. Proceed with caution.
                      </p>
                    </div>
                  </div>
                  <div className="p-6 space-y-4">
                    {[
                      {
                        type: 'suspend', label: 'Suspend account',
                        desc: 'Temporarily disable your account. You can restore access later.',
                        btnLabel: 'Suspend', btnStyle: { background: 'transparent', color: '#EF4444', border: '1px solid rgba(239,68,68,0.4)' },
                      },
                      {
                        type: 'permanent', label: 'Delete account',
                        desc: 'Permanently delete your account and all associated data. Cannot be undone.',
                        btnLabel: 'Delete', btnStyle: { background: '#EF4444', color: '#fff' },
                      },
                    ].map(({ type, label, desc, btnLabel, btnStyle }, i) => (
                      <div key={type}>
                        {i > 0 && <div style={{ height: 1, background: '#374151', marginBottom: 16 }} />}
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-sm font-bold" style={{ color: '#F9FAFB' }}>{label}</p>
                            <p className="text-xs mt-0.5" style={{ color: '#6B7280' }}>{desc}</p>
                          </div>
                          <button
                            onClick={() => handleAccountAction(type)}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all flex-shrink-0"
                            style={btnStyle}
                          >
                            {type === 'suspend' ? <Shield size={13} /> : <Trash2 size={13} />}
                            {btnLabel}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
