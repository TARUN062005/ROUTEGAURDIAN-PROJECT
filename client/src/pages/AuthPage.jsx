import React, { useEffect, useState } from 'react';
import { Shield, Github, AlertTriangle, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate, useSearchParams } from 'react-router-dom';
import authService from '../lib/auth/authService';
import { useAuth } from '../lib/auth/hooks/useAuth';
import { motion, AnimatePresence } from 'framer-motion';

const AuthPage = () => {
  const { user, loading } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(null); // 'google' | 'github' | null
  const [errorMessage, setErrorMessage] = useState(null);

  useEffect(() => {
    if (!loading && user) {
      navigate('/dashboard', { replace: true });
    }
  }, [loading, user, navigate]);

  useEffect(() => {
    const err = searchParams.get('error');
    if (err) {
      const decoded = decodeURIComponent(err);
      setErrorMessage(decoded);
      toast.error(decoded);
    }
  }, [searchParams]);

  const handleSocial = async (provider) => {
    setSubmitting(provider);
    setErrorMessage(null);
    try {
      authService.startOAuth(provider);
    } catch (err) {
      setErrorMessage(`Failed to initiate secure ${provider} handshake.`);
      toast.error(`Failed to initiate ${provider} authentication`);
      setSubmitting(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#060B18] flex flex-col items-center justify-center space-y-6">
        <div className="relative">
          <div className="h-16 w-16 border-t-2 border-cyan-400 rounded-full animate-spin" />
          <Shield className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-cyan-400 animate-pulse" size={24} />
        </div>
        <p className="text-slate-500 font-bold tracking-widest uppercase text-[10px]">Verifying Security Credentials...</p>
      </div>
    );
  }

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
        className="w-full max-w-md bg-slate-950/40 border border-slate-900/80 backdrop-blur-2xl rounded-3xl p-8 sm:p-10 shadow-2xl relative z-10 space-y-8"
      >
        {/* Glow border effect */}
        <div className="absolute -inset-[1px] bg-gradient-to-r from-cyan-500/20 to-blue-600/20 rounded-3xl blur-sm pointer-events-none -z-10" />

        <div className="flex flex-col items-center text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl border border-cyan-500/30 overflow-hidden bg-cyan-950/20 shadow-inner shadow-cyan-500/5 flex items-center justify-center">
            <img src="/LOGO.png" alt="RouteGuardian Logo" className="w-full h-full object-cover" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-black tracking-tight text-white uppercase sm:text-3xl">
              RouteGuardian
            </h1>
            <p className="text-[9px] text-cyan-400/80 font-black uppercase tracking-[0.25em]">
              Risk Intelligence Console
            </p>
          </div>
        </div>

        {/* Dynamic Error State Message Box */}
        <AnimatePresence>
          {errorMessage && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-red-500/5 border border-red-500/20 text-red-200 text-xs p-4 rounded-xl flex gap-3 items-start"
            >
              <AlertTriangle className="text-red-400 flex-shrink-0 mt-0.5" size={15} />
              <div className="space-y-1 text-left">
                <span className="font-extrabold block">Verification Error</span>
                <span className="text-slate-400 font-medium leading-relaxed block">{errorMessage}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Description */}
        <p className="text-xs sm:text-sm text-slate-400 text-center leading-relaxed">
          Logistics route risk analysis and fleet security management. Sign in using your enterprise provider account to access clearance coordinates and real-time geofenced monitors.
        </p>

        {/* Action Buttons */}
        <div className="space-y-4">
          <button
            onClick={() => handleSocial('google')}
            disabled={submitting !== null}
            className="w-full flex items-center justify-center gap-3.5 py-3.5 px-4 rounded-xl bg-slate-900 border border-slate-800 hover:border-cyan-500/30 hover:bg-[#101826]/40 transition-all font-bold text-xs uppercase tracking-wider relative group overflow-hidden cursor-pointer"
          >
            {submitting === 'google' ? (
              <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#ea4335" d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.114-5.136 4.114-3.41 0-6.17-2.76-6.17-6.17s2.76-6.17 6.17-6.17c1.487 0 2.848.533 3.905 1.41l3.052-3.053C18.995 2.1 15.823 1 12.24 1 6.033 1 12.24s5.033 11.24 11.24 11.24c5.898 0 10.748-4.254 11.218-9.865H12.24z" />
                </svg>
                <span>Continue with Google Workspace</span>
              </>
            )}
          </button>

          <button
            onClick={() => handleSocial('github')}
            disabled={submitting !== null}
            className="w-full flex items-center justify-center gap-3.5 py-3.5 px-4 rounded-xl bg-slate-900 border border-slate-800 hover:border-cyan-500/30 hover:bg-[#101826]/40 transition-all font-bold text-xs uppercase tracking-wider relative group overflow-hidden cursor-pointer"
          >
            {submitting === 'github' ? (
              <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Github size={16} className="text-white" />
                <span>Continue with GitHub Account</span>
              </>
            )}
          </button>
        </div>

        {/* Footer */}
        <div className="text-center pt-2">
          <p className="text-[10px] text-slate-600 font-extrabold uppercase tracking-widest flex items-center justify-center gap-1">
            <Shield size={10} className="text-slate-600" /> Protected by RouteGuardian Security Shield
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default AuthPage;