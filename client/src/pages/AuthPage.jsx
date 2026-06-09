import React, { useEffect, useState } from 'react';
import { Shield, Github } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate, useSearchParams } from 'react-router-dom';
import authService from '../lib/auth/authService';
import { useAuth } from '../lib/auth/hooks/useAuth';
import { motion } from 'framer-motion';

const AuthPage = () => {
  const { user, loading } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(null); // 'google' | 'github' | null

  useEffect(() => {
    if (!loading && user) {
      navigate('/dashboard', { replace: true });
    }
  }, [loading, user, navigate]);

  useEffect(() => {
    const err = searchParams.get('error');
    if (err) toast.error(decodeURIComponent(err));
  }, [searchParams]);

  const handleSocial = async (provider) => {
    setSubmitting(provider);
    try {
      authService.startOAuth(provider);
    } catch (err) {
      toast.error(`Failed to initiate ${provider} authentication`);
      setSubmitting(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#030712] relative overflow-hidden flex flex-col justify-center items-center p-6 text-[#F1F5F9] font-sans">
      {/* Background gradients */}
      <div className="absolute top-[-30%] left-[-30%] w-[80%] h-[80%] bg-cyan-500/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-[-30%] right-[-30%] w-[80%] h-[80%] bg-blue-600/10 rounded-full blur-[140px] pointer-events-none" />
      
      {/* Grid pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-35 pointer-events-none" />

      {/* Main card */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-md bg-slate-950/60 border border-slate-900/80 backdrop-blur-xl rounded-2xl p-8 sm:p-10 shadow-2xl relative z-10 space-y-8"
      >
        {/* Glow border effect */}
        <div className="absolute -inset-[1px] bg-gradient-to-r from-cyan-500/20 to-blue-600/20 rounded-2xl blur-sm pointer-events-none -z-10" />

        {/* Logo and header */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="rounded-2xl border border-cyan-500/30 p-3 bg-cyan-950/20 shadow-inner shadow-cyan-500/5">
            <Shield size={32} className="text-cyan-400" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-black tracking-tight text-white uppercase sm:text-3xl">
              RouteGuardian
            </h1>
            <p className="text-xs text-slate-500 font-extrabold uppercase tracking-widest">
              Risk Intelligence Console
            </p>
          </div>
        </div>

        <div className="border-t border-slate-900/60 my-6" />

        {/* Description */}
        <p className="text-xs sm:text-sm text-slate-400 text-center leading-relaxed">
          Logistics route risk sifting & fleet assurance. Sign in using your enterprise provider account to access security telemetry and secure transit corridors.
        </p>

        {/* Buttons */}
        <div className="space-y-4">
          <button
            onClick={() => handleSocial('google')}
            disabled={submitting !== null}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl bg-slate-900 border border-slate-800 hover:border-cyan-500/30 hover:bg-slate-800/80 transition-all font-semibold text-xs uppercase tracking-wider relative group overflow-hidden"
          >
            {submitting === 'google' ? (
              <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <svg className="w-4 h-4 mr-1" viewBox="0 0 24 24">
                  <path fill="#ea4335" d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.114-5.136 4.114-3.41 0-6.17-2.76-6.17-6.17s2.76-6.17 6.17-6.17c1.487 0 2.848.533 3.905 1.41l3.052-3.053C18.995 2.1 15.823 1 12.24 1 6.033 1 1 6.033 1 12.24s5.033 11.24 11.24 11.24c5.898 0 10.748-4.254 11.218-9.865H12.24z" />
                </svg>
                <span>Continue with Google</span>
              </>
            )}
          </button>

          <button
            onClick={() => handleSocial('github')}
            disabled={submitting !== null}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl bg-slate-900 border border-slate-800 hover:border-cyan-500/30 hover:bg-slate-800/80 transition-all font-semibold text-xs uppercase tracking-wider relative group overflow-hidden"
          >
            {submitting === 'github' ? (
              <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Github size={16} className="text-white" />
                <span>Continue with GitHub</span>
              </>
            )}
          </button>
        </div>

        {/* Footer */}
        <div className="text-center pt-2">
          <p className="text-[10px] text-slate-600 font-extrabold uppercase tracking-widest">
            Protected by RouteGuardian Security Shield
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default AuthPage;