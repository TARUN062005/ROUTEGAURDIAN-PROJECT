import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Shield, ArrowRight, AlertTriangle, ShieldAlert, Activity, Globe, Anchor, 
  Plane, Truck, MapPin, Layers, Cpu, Compass
} from 'lucide-react';
import { useAuth } from '../lib/auth/hooks/useAuth';
import axios from 'axios';

const BASE_URL = import.meta.env.VITE_BACKEND_URL || '';

const PRESETS = [
  {
    id: 'mumbai-singapore',
    label: 'Mumbai → Singapore',
    origin: 'Mumbai Port, India',
    destination: 'Singapore Strait',
    mode: 'Sea',
    distance: '4,210 km',
    duration: '11 days',
    safetyScore: '92%',
    riskLevel: 'Low',
    waypoints: ['Indian Ocean', 'Andaman Sea Corridor', 'Strait of Malacca'],
    weatherAlert: 'Moderate swell waves in the Andaman Sea. Wind speeds: 15-20 knots.',
    geoAlert: 'Increased maritime security patrols active around Singapore Strait.',
    color: '#00C2FF',
    svgPath: 'M 60,180 C 130,200 200,220 240,260 T 340,300',
    originX: 60, originY: 180,
    destX: 340, destY: 300,
    vesselX: 200, vesselY: 230,
  },
  {
    id: 'delhi-hyderabad',
    label: 'Delhi → Hyderabad',
    origin: 'New Delhi IGI, India',
    destination: 'Hyderabad Transit Hub',
    mode: 'Road',
    distance: '1,250 km',
    duration: '32 hours',
    safetyScore: '89%',
    riskLevel: 'Low-Medium',
    waypoints: ['Agra Expressway', 'Nagpur Bypass Corridor', 'Adilabad NH-44'],
    weatherAlert: 'Clear visibility reported along NH-44. High daytime temperatures.',
    geoAlert: 'Local logistics checkpoints active near Nagpur. Anticipate minor delays.',
    color: '#FF9F43',
    svgPath: 'M 200,60 Q 205,170 200,310',
    originX: 200, originY: 60,
    destX: 200, destY: 310,
    vesselX: 202, vesselY: 190,
  },
  {
    id: 'chennai-dubai',
    label: 'Chennai → Dubai',
    origin: 'Chennai Intl (MAA)',
    destination: 'Dubai Cargo (DWC)',
    mode: 'Air',
    distance: '2,930 km',
    duration: '4.5 hours',
    safetyScore: '96%',
    riskLevel: 'Low',
    waypoints: ['Bay of Bengal Sector', 'Arabian Sea Corridor', 'Oman Airspace'],
    weatherAlert: 'Strong head winds detected over Arabian Sea. Minimal turbulence.',
    geoAlert: 'Oman airspace traffic coordination advisory active. Flight path cleared.',
    color: '#FF5C7A',
    svgPath: 'M 340,280 Q 200,180 60,80',
    originX: 340, originY: 280,
    destX: 60, destY: 80,
    vesselX: 200, vesselY: 150,
  },
];

const LandingPage = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [incidents, setIncidents] = useState([]);
  const [fetchingIncidents, setFetchingIncidents] = useState(true);
  const [activePreset, setActivePreset] = useState(0);

  useEffect(() => {
    if (!loading && user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    const fetchIncidents = async () => {
      try {
        const res = await axios.get(`${BASE_URL}/api/auth/intelligence-preview`);
        if (res.data?.success && Array.isArray(res.data.incidents)) {
          setIncidents(res.data.incidents);
        }
      } catch (err) {
        console.warn('Failed to load intelligence preview:', err.message);
      } finally {
        setFetchingIncidents(false);
      }
    };
    fetchIncidents();
  }, []);

  const scrollToSection = (id) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  if (loading || user) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#060B18]">
        <div className="relative flex items-center justify-center">
          <div className="absolute w-24 h-24 border-2 rounded-full opacity-30 animate-ping border-cyan-400" />
          <div className="absolute w-16 h-16 border-t-2 rounded-full animate-spin border-cyan-400" />
          <Shield className="text-white" size={32} />
        </div>
        <p className="mt-8 text-xs tracking-[0.3em] uppercase text-slate-400">Restoring Encrypted Session...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#030712] text-[#F1F5F9] font-sans selection:bg-cyan-500/30 overflow-x-hidden relative">
      
      {/* Background neon glows */}
      <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-cyan-500/5 rounded-full blur-[140px] pointer-events-none -z-10" />
      <div className="absolute top-[60vh] right-10 w-[700px] h-[700px] bg-blue-600/5 rounded-full blur-[160px] pointer-events-none -z-10" />
      
      {/* Grid mask overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-20 pointer-events-none -z-10" />

      {/* 1. NAVIGATION BAR */}
      <nav className="fixed top-0 w-full z-[100] bg-[#030712]/85 backdrop-blur-xl border-b border-slate-900 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          
          {/* Logo brand */}
          <button className="flex items-center gap-3 group text-left cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="w-8 h-8 rounded-xl border border-cyan-500/20 bg-cyan-950/20 overflow-hidden flex items-center justify-center group-hover:border-cyan-400 transition-all duration-300">
              <img src="/LOGO.png" alt="RouteGuardian Logo" className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400 leading-none mb-1">RouteGuardian</p>
              <p className="text-xs font-bold text-white leading-none">Logistics Intelligence</p>
            </div>
          </button>

          {/* Links */}
          <div className="flex items-center gap-6 text-xs font-bold uppercase tracking-wider">
            <button onClick={() => scrollToSection('features')} className="text-slate-400 hover:text-white transition-colors cursor-pointer">Core Pillars</button>
            <button onClick={() => scrollToSection('intelligence')} className="text-slate-400 hover:text-white transition-colors cursor-pointer">Live Alerts</button>
            <Link to="/auth" className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black shadow-md shadow-cyan-500/10 hover:shadow-cyan-400/20 transition-all duration-300 transform active:scale-95">
              Launch Console
            </Link>
          </div>
        </div>
      </nav>

      {/* 2. HERO SECTION */}
      <section className="pt-32 pb-20 px-6 max-w-7xl mx-auto grid lg:grid-cols-12 gap-12 items-center min-h-[90vh]">
        <div className="lg:col-span-7 space-y-6 text-left">
          
          {/* Tagline */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/40 border border-cyan-500/30 text-cyan-400 text-[10px] font-black uppercase tracking-wider">
            <Activity size={10} className="animate-pulse" /> Live Telemetry Linked
          </div>
          
          <h1 className="text-4xl sm:text-5xl lg:text-[3.25rem] font-black text-white leading-[1.15] tracking-tight">
            Logistics Risk Auditing <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">For Global Cargo Fleets</span>
          </h1>
          
          <p className="text-sm sm:text-base text-slate-400 leading-relaxed max-w-xl">
            Auto-generate optimal routes across Sea, Air, and Road sectors. Instantly synthesize dynamic shipping coordinates with active geopolitical conflict zones and real-time meteorological corridor metrics.
          </p>

          <div className="flex flex-wrap gap-4 pt-2">
            <Link to="/auth" className="flex items-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black text-xs uppercase tracking-wider transition-all shadow-lg shadow-cyan-500/10 hover:shadow-cyan-400/20">
              Access The Console <ArrowRight size={14} />
            </Link>
            <button onClick={() => scrollToSection('intelligence')} className="px-6 py-3.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-white font-bold text-xs uppercase tracking-wider transition-all cursor-pointer">
              Live Threat Stream
            </button>
          </div>
        </div>

        {/* 3. HERO DASHBOARD TERMINAL MOCKUP */}
        <div className="lg:col-span-5 flex flex-col gap-4 w-full relative z-10">
          
          {/* Glassmorphic Mockup Container */}
          <div className="bg-[#101826]/75 border border-slate-800/80 backdrop-blur-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            
            {/* Header Tabs */}
            <div className="px-5 py-3 border-b border-slate-800 bg-[#090f1d]/80 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-red-500/60" />
                <div className="w-2 h-2 rounded-full bg-yellow-500/60" />
                <div className="w-2 h-2 rounded-full bg-green-500/60" />
                <span className="text-[9px] text-slate-500 font-mono ml-2">routeguardian_terminal</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-1 h-1 rounded-full bg-cyan-400 animate-pulse" />
                <span className="text-[8px] text-cyan-400 font-black uppercase tracking-widest">Active Simulator</span>
              </div>
            </div>

            {/* Selector bar */}
            <div className="p-3 border-b border-slate-850 flex bg-slate-950/40 gap-1.5">
              {PRESETS.map((p, idx) => (
                <button
                  key={p.id}
                  onClick={() => setActivePreset(idx)}
                  className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                    activePreset === idx
                      ? 'bg-slate-900 text-[#00C2FF] border border-slate-800'
                      : 'text-slate-400 hover:text-white bg-transparent border border-transparent'
                  }`}
                >
                  {p.mode}
                </button>
              ))}
            </div>

            {/* Interactive Vector Route Map */}
            <div className="relative h-[200px] border-b border-slate-850 bg-slate-950/60 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-[linear-gradient(to_right,#0c1324_1px,transparent_1px),linear-gradient(to_bottom,#0c1324_1px,transparent_1px)] bg-[size:16px_16px]" />
              
              <svg className="w-full h-full relative z-10" viewBox="0 0 400 400">
                <path
                  d={PRESETS[activePreset].svgPath}
                  fill="none"
                  stroke={PRESETS[activePreset].color}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  style={{ strokeDasharray: '8, 8' }}
                />

                {/* Nodes */}
                <circle cx={PRESETS[activePreset].originX} cy={PRESETS[activePreset].originY} r="5" fill={PRESETS[activePreset].color} />
                <circle cx={PRESETS[activePreset].destX} cy={PRESETS[activePreset].destY} r="5" fill={PRESETS[activePreset].color} />

                {/* Pulsing Target Tracker */}
                <g transform={`translate(${PRESETS[activePreset].vesselX}, ${PRESETS[activePreset].vesselY})`}>
                  <circle r="9" fill="rgba(255,255,255,0.12)" className="animate-ping" />
                  <circle r="4.5" fill="#FFF" />
                </g>
              </svg>

              {/* Status Tags */}
              <span className="absolute top-3 left-3 bg-slate-950/80 border border-slate-800 rounded px-2 py-0.5 text-[8px] font-black uppercase text-slate-400 tracking-wider">
                {PRESETS[activePreset].distance} Corridor
              </span>
              <span className="absolute top-3 right-3 bg-slate-950/80 border border-slate-800 rounded px-2 py-0.5 text-[8px] font-black uppercase text-cyan-400 tracking-wider">
                Corridor Safety: {PRESETS[activePreset].safetyScore}
              </span>
            </div>

            {/* Real Stats Metadata Block */}
            <div className="p-5 text-left space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest block">Cargo Vector</span>
                  <h4 className="text-xs font-black text-white mt-0.5">
                    {PRESETS[activePreset].origin} → {PRESETS[activePreset].destination}
                  </h4>
                </div>
                <div className="text-right">
                  <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest block">ETA Spec</span>
                  <span className="text-xs font-bold text-cyan-400 mt-0.5 block">{PRESETS[activePreset].duration}</span>
                </div>
              </div>

              <div className="border-t border-slate-850 pt-3 space-y-2 text-[11px]">
                <div className="flex items-start gap-2 text-slate-300">
                  <AlertTriangle size={12} className="text-[#FF9F43] mt-0.5 flex-shrink-0" />
                  <span>
                    <b className="text-[#FF9F43] font-bold">Corridor Weather: </b>
                    <span className="text-slate-400 font-medium">{PRESETS[activePreset].weatherAlert}</span>
                  </span>
                </div>
                <div className="flex items-start gap-2 text-slate-300">
                  <ShieldAlert size={12} className="text-[#FF5C7A] mt-0.5 flex-shrink-0" />
                  <span>
                    <b className="text-[#FF5C7A] font-bold">Geopolitical Risk: </b>
                    <span className="text-slate-400 font-medium">{PRESETS[activePreset].geoAlert}</span>
                  </span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* 4. FOUR CORE INTEL PILLARS */}
      <section id="features" className="py-20 px-6 border-t border-slate-900 bg-[#030712] relative z-10">
        <div className="max-w-7xl mx-auto space-y-12">
          
          {/* Section Heading */}
          <div className="text-center space-y-3 max-w-xl mx-auto">
            <h2 className="text-3xl font-black tracking-tight text-white uppercase text-center">
              Core Security Pillars
            </h2>
            <p className="text-slate-400 text-xs sm:text-sm leading-relaxed text-center font-medium">
              A comprehensive risk model built for enterprise fleet assurance. We evaluate all transit parameters offline and online.
            </p>
          </div>

          {/* Pillars Grid */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            
            {/* Pillar 1 */}
            <div className="bg-slate-950/40 border border-slate-900/60 rounded-2xl p-6 hover:border-cyan-500/20 hover:shadow-xl hover:shadow-cyan-500/5 transition-all duration-300 flex flex-col justify-between text-left h-60">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20 text-cyan-400">
                <Globe size={18} />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-black text-white uppercase tracking-wider">Geopolitical Analysis</h3>
                <p className="text-xs text-slate-400 leading-relaxed font-medium">
                  Continuous tracking of conflict zones, trade sanctions, airspace closures, and piracy risks along global transit vectors.
                </p>
              </div>
            </div>

            {/* Pillar 2 */}
            <div className="bg-slate-950/40 border border-slate-900/60 rounded-2xl p-6 hover:border-emerald-500/20 hover:shadow-xl hover:shadow-emerald-500/5 transition-all duration-300 flex flex-col justify-between text-left h-60">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 text-emerald-400">
                <Cpu size={18} />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-black text-white uppercase tracking-wider">Route Optimization</h3>
                <p className="text-xs text-slate-400 leading-relaxed font-medium">
                  AI-driven waypoint generators mapping distance-optimized routes across multi-mode transportation lines.
                </p>
              </div>
            </div>

            {/* Pillar 3 */}
            <div className="bg-slate-950/40 border border-slate-900/60 rounded-2xl p-6 hover:border-amber-500/20 hover:shadow-xl hover:shadow-amber-500/5 transition-all duration-300 flex flex-col justify-between text-left h-60">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20 text-amber-500">
                <Compass size={18} />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-black text-white uppercase tracking-wider">Weather Intelligence</h3>
                <p className="text-xs text-slate-400 leading-relaxed font-medium">
                  Granular weather corridor forecasts inspecting high wind gusts, heavy storms, and tropical storm paths.
                </p>
              </div>
            </div>

            {/* Pillar 4 */}
            <div className="bg-slate-950/40 border border-slate-900/60 rounded-2xl p-6 hover:border-purple-500/20 hover:shadow-xl hover:shadow-purple-500/5 transition-all duration-300 flex flex-col justify-between text-left h-60">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center border border-purple-500/20 text-purple-400">
                <Layers size={18} />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-black text-white uppercase tracking-wider">Shipment Analytics</h3>
                <p className="text-xs text-slate-400 leading-relaxed font-medium">
                  SaaS telemetry records documenting safety history logs, threat level intersections, and risk profiles.
                </p>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* 5. LIVE INCIDENTS PREVIEW */}
      <section id="intelligence" className="py-20 px-6 border-t border-slate-900 bg-[#030712]">
        <div className="max-w-7xl mx-auto space-y-10">
          
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="space-y-3 text-left">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-black uppercase tracking-wider">
                GEO_RISK_ENGINE Threat Feed
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-white uppercase">Live Risk Telemetry Stream</h2>
              <p className="text-slate-400 text-xs sm:text-sm max-w-lg leading-relaxed font-medium">
                Active alerts currently cached in our platform georisk index. Operations monitors evaluate these threats to protect transiting vessels.
              </p>
            </div>
            <Link to="/auth" className="flex items-center gap-1.5 text-xs text-cyan-400 font-extrabold hover:text-cyan-300 hover:underline flex-shrink-0 transition-colors">
              Access Full Threat Feed <ArrowRight size={12} />
            </Link>
          </div>

          {fetchingIncidents ? (
            <div className="grid md:grid-cols-3 gap-6">
              {[0, 1, 2].map(i => (
                <div key={i} className="bg-slate-950/40 border border-slate-900/60 rounded-2xl p-5 h-40 animate-pulse space-y-4">
                  <div className="w-20 h-4 bg-slate-800/60 rounded" />
                  <div className="w-full h-8 bg-slate-800/60 rounded" />
                  <div className="w-1/2 h-4 bg-slate-800/60 rounded" />
                </div>
              ))}
            </div>
          ) : incidents.length > 0 ? (
            <div className="grid md:grid-cols-3 gap-6">
              {incidents.map((inc, i) => {
                const isCritical = inc.severity?.toUpperCase() === 'CRITICAL';
                const isHigh = inc.severity?.toUpperCase() === 'HIGH';
                const severityColor = isCritical ? 'text-red-400 bg-red-500/10 border-red-500/25' : isHigh ? 'text-orange-400 bg-orange-500/10 border-orange-500/25' : 'text-yellow-400 bg-yellow-500/10 border-yellow-500/25';
                
                return (
                  <div key={i} className="bg-slate-950/40 border border-slate-900/60 rounded-2xl p-5 hover:border-slate-800 transition-all duration-300 flex flex-col justify-between text-left space-y-4">
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className={`px-2.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border ${severityColor}`}>
                          {inc.severity || 'Medium'} Risk
                        </span>
                        <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">{inc.category || 'general'}</span>
                      </div>
                      <h4 className="text-xs sm:text-sm font-extrabold text-white leading-relaxed line-clamp-3">
                        {inc.headline}
                      </h4>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-500 border-t border-slate-800/50 pt-3 flex-shrink-0">
                      <div className="flex items-center gap-1 font-semibold truncate max-w-[130px]">
                        <MapPin size={10} className="text-slate-500 flex-shrink-0" />
                        <span className="truncate">{inc.location}</span>
                      </div>
                      <span className="font-semibold text-slate-600 flex-shrink-0">{inc.publisher || 'RG Intel'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-slate-950/40 border border-slate-900/60 rounded-2xl p-8 text-center text-slate-500 font-semibold text-xs tracking-wider uppercase">
              No active tactical incidents reported. Threat stream clear.
            </div>
          )}
        </div>
      </section>

      {/* 6. PLATFORM CTA CARD */}
      <section className="py-20 px-6 border-t border-slate-900 text-center bg-[#030712] relative z-10">
        <div className="max-w-xl mx-auto space-y-6">
          <h2 className="text-3xl font-black tracking-tight text-white uppercase">Secure Your Shipping Vectors</h2>
          <p className="text-slate-400 text-xs sm:text-sm leading-relaxed font-medium">
            Gain access to RouteGuardian's complete cargo routing suite, geofenced threat alerts, alternative vector evaluations, and historical shipment telemetry.
          </p>
          <div className="pt-2">
            <Link to="/auth" className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black text-xs uppercase tracking-wider transition-all shadow-lg shadow-cyan-500/10 hover:shadow-cyan-400/20">
              Launch SECURE Console <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>

      {/* 7. BRAND FOOTER */}
      <footer className="border-t border-slate-900 bg-[#03060E] py-10 px-6 text-center text-slate-500 text-xs">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <Shield size={16} className="text-cyan-400" />
            <span className="font-black uppercase tracking-wider text-slate-400">RouteGuardian</span>
          </div>
          <p className="font-medium">© {new Date().getFullYear()} RouteGuardian. Enterprise Route Risk Auditing Platform. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;

      {/* 7. BRAND FOOTER */}
      <footer className="border-t border-slate-900 bg-[#03060E] py-10 px-6 text-center text-slate-500 text-xs">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <Shield size={16} className="text-cyan-400" />
            <span className="font-black uppercase tracking-wider text-slate-400">RouteGuardian</span>
          </div>
          <p className="font-medium">© {new Date().getFullYear()} RouteGuardian. Enterprise Route Risk Auditing Platform. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;