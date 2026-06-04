import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell, Loader2, ShieldAlert, AlertTriangle, AlertCircle,
  Clock, ExternalLink, Globe, RefreshCw, Search, X,
  FileText, MapPin, Filter
} from "lucide-react";

const BASE_URL = import.meta.env.VITE_BACKEND_URL || "";

const SEV_CONFIG = {
  CRITICAL: { icon: ShieldAlert,  color: "#EF4444", bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.3)" },
  HIGH:     { icon: AlertTriangle, color: "#F59E0B", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.3)" },
  MODERATE: { icon: AlertCircle,   color: "#38BDF8", bg: "rgba(56,189,248,0.12)",  border: "rgba(56,189,248,0.3)"  },
};

const formatDate = (dateString) => {
  if (!dateString) return "-";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "-";
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const NotificationsPage = () => {
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState([]);
  const [openAlert, setOpenAlert] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSeverity, setSelectedSeverity] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");

  const fetchAlerts = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${BASE_URL}/api/ai/alerts`, { withCredentials: true });
      if (res.data?.success) {
        setAlerts(res.data.alerts || []);
      } else {
        toast.error("Failed to load live risk feed");
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to load live risk feed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, []);

  // Compute dynamic categories
  const categories = useMemo(() => {
    const cats = new Set();
    alerts.forEach((a) => {
      if (a.category) {
        cats.add(a.category.toLowerCase());
      }
    });
    return Array.from(cats);
  }, [alerts]);

  // Filtered alerts
  const filteredAlerts = useMemo(() => {
    return alerts.filter((a) => {
      // 1. Search Query
      const matchQuery =
        !searchQuery.trim() ||
        a.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.category?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.country?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.source?.toLowerCase().includes(searchQuery.toLowerCase());

      // 2. Severity
      const matchSeverity =
        selectedSeverity === "all" ||
        a.severity?.toUpperCase() === selectedSeverity.toUpperCase();

      // 3. Category
      const matchCategory =
        selectedCategory === "all" ||
        a.category?.toLowerCase() === selectedCategory.toLowerCase();

      return matchQuery && matchSeverity && matchCategory;
    });
  }, [alerts, searchQuery, selectedSeverity, selectedCategory]);

  // Compute stats
  const stats = useMemo(() => {
    let total = alerts.length;
    let critical = alerts.filter((a) => a.severity === "CRITICAL").length;
    let high = alerts.filter((a) => a.severity === "HIGH").length;
    let moderate = alerts.filter((a) => a.severity === "MODERATE").length;
    return { total, critical, high, moderate };
  }, [alerts]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: "#00C2FF" }}>
            INTELLIGENCE FEED
          </p>
          <h1 className="text-2xl font-black" style={{ color: "#F9FAFB" }}>Global Risk Alerts</h1>
          <p className="text-sm mt-0.5" style={{ color: "#6B7280" }}>
            Real-time global logistics threats aggregated from the live GEO_RISK_ENGINE feed
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchAlerts}
            className="p-2 rounded-xl transition-all"
            style={{ color: "#6B7280", background: "#1F2937", border: "1px solid #374151" }}
            onMouseEnter={e => e.currentTarget.style.color = "#F9FAFB"}
            onMouseLeave={e => e.currentTarget.style.color = "#6B7280"}
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Incidents", value: stats.total, color: "#9CA3AF", bg: "#1F2937" },
          { label: "Critical Severity", value: stats.critical, color: "#EF4444", bg: "rgba(239,68,68,0.1)" },
          { label: "High Severity", value: stats.high, color: "#F59E0B", bg: "rgba(245,158,11,0.1)" },
          { label: "Moderate Severity", value: stats.moderate, color: "#38BDF8", bg: "rgba(56,189,248,0.1)" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className="flex items-center justify-between px-4 py-3 rounded-xl" style={{ background: bg, border: "1px solid #374151" }}>
            <p className="text-xs font-semibold truncate" style={{ color: "#9CA3AF" }}>{label}</p>
            <p className="text-2xl font-black" style={{ color }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Filters & Search controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 rounded-xl" style={{ background: "#1F2937", border: "1px solid #374151" }}>
        
        {/* Left Side: Search & Filter icon */}
        <div className="flex items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4" style={{ color: "#6B7280" }} />
            <input
              type="text"
              placeholder="Search incidents by location, title, or source..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl text-sm transition-all focus:outline-none focus:ring-1 focus:ring-[#00C2FF]"
              style={{
                background: "#111827",
                border: "1px solid #374151",
                color: "#F9FAFB"
              }}
            />
          </div>
          
          {/* Category Dropdown */}
          <div className="relative flex items-center">
            <Filter size={13} className="absolute left-3" style={{ color: "#6B7280" }} />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="appearance-none pl-8 pr-8 py-2 rounded-xl text-xs font-bold transition-all focus:outline-none focus:ring-1 focus:ring-[#00C2FF] cursor-pointer"
              style={{
                background: "#111827",
                border: "1px solid #374151",
                color: "#F9FAFB"
              }}
            >
              <option value="all">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c} className="capitalize">
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Right Side: Severity Toggles */}
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: "#111827", border: "1px solid #374151" }}>
          {["all", "CRITICAL", "HIGH", "MODERATE"].map((s) => (
            <button
              key={s}
              onClick={() => setSelectedSeverity(s)}
              className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all capitalize cursor-pointer"
              style={{
                background: selectedSeverity === s ? "#374151" : "transparent",
                color: selectedSeverity === s ? "#F9FAFB" : "#6B7280",
              }}
            >
              {s === "all" ? "All Severity" : s.toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Incident Feed List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin" size={28} style={{ color: "#374151" }} />
        </div>
      ) : filteredAlerts.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-16 rounded-2xl"
          style={{ background: "#1F2937", border: "1px solid #374151" }}
        >
          <Bell size={40} style={{ color: "#374151" }} />
          <p className="text-base font-bold mt-3" style={{ color: "#6B7280" }}>No matching threats</p>
          <p className="text-sm mt-1" style={{ color: "#374151" }}>Try adjusting your search filters</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {filteredAlerts.map((n, idx) => {
              const sevConf = SEV_CONFIG[n.severity?.toUpperCase()] || SEV_CONFIG.MODERATE;

              return (
                <motion.div
                  key={n.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ delay: idx * 0.02 }}
                  className="rounded-2xl flex flex-col overflow-hidden transition-all duration-300"
                  style={{
                    background: "#1F2937",
                    border: `1px solid #374151`,
                    borderTop: `4px solid ${sevConf.color}`
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = "translateY(-4px)";
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)";
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.borderColor = "#374151";
                  }}
                >
                  {/* Event Image */}
                  {n.image_url ? (
                    <div className="relative h-44 overflow-hidden bg-slate-900">
                      <img
                        src={n.image_url}
                        alt={n.title}
                        className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                      />
                      <div className="absolute top-3 right-3">
                        <span
                          className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full shadow-lg"
                          style={{ background: sevConf.bg, color: sevConf.color, backdropFilter: "blur(4px)" }}
                        >
                          {n.severity}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="relative h-44 bg-slate-800/40 flex flex-col items-center justify-center text-slate-500 gap-2 border-b border-slate-700/50">
                      <Globe size={24} className="opacity-40" />
                      <span className="text-[10px] uppercase font-black tracking-wider opacity-60">No Media Cover</span>
                      <div className="absolute top-3 right-3">
                        <span
                          className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full shadow-lg"
                          style={{ background: sevConf.bg, color: sevConf.color }}
                        >
                          {n.severity}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Body Content */}
                  <div className="p-4 flex-1 flex flex-col gap-2">
                    <div className="flex justify-between items-center gap-2 text-[10px] text-slate-400 font-bold">
                      <span className="capitalize px-1.5 py-0.5 rounded bg-slate-800 text-slate-200">
                        {n.category || "General"}
                      </span>
                      <span>{n.source}</span>
                    </div>

                    <h3 className="text-sm font-bold line-clamp-2 text-white flex-1 min-h-[40px] hover:text-[#00C2FF] transition-colors cursor-pointer"
                        onClick={() => setOpenAlert(n)}>
                      {n.title}
                    </h3>

                    <div className="flex justify-between items-center text-[10px] text-slate-500 py-1.5 border-t border-slate-800">
                      <div className="flex items-center gap-1">
                        <Clock size={11} />
                        <span>{formatDate(n.published)}</span>
                      </div>
                      {n.confidence != null && (
                        <span>Conf: {Math.round(n.confidence * 100)}%</span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 mt-2 pt-2 border-t border-slate-800">
                      <button
                        onClick={() => setOpenAlert(n)}
                        className="flex-1 py-2 rounded-xl text-xs font-bold transition-all text-center cursor-pointer bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700"
                      >
                        View Article
                      </button>
                      {n.source_url && (
                        <a
                          href={n.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex-1 py-2 rounded-xl text-xs font-bold transition-all text-center cursor-pointer bg-[#00C2FF] text-[#0F172A] hover:bg-[#00A3D9] flex items-center justify-center gap-1 shadow-md"
                        >
                          Open Source <ExternalLink size={11} />
                        </a>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Detail modal */}
      <AnimatePresence>
        {openAlert && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
            onClick={() => setOpenAlert(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 16 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-lg rounded-2xl overflow-hidden"
              style={{ background: "#1F2937", border: "1px solid #374151" }}
            >
              {/* Modal header */}
              <div className="flex items-start justify-between p-5" style={{ borderBottom: "1px solid #374151" }}>
                <div className="flex items-start gap-3">
                  {(() => {
                    const tc = SEV_CONFIG[openAlert.severity?.toUpperCase()] || SEV_CONFIG.MODERATE;
                    const TI = tc.icon;
                    return (
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: tc.bg }}>
                        <TI size={18} style={{ color: tc.color }} />
                      </div>
                    );
                  })()}
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest capitalize" style={{ color: "#6B7280" }}>
                      {openAlert.category || "General"} · {openAlert.severity}
                    </p>
                    <h3 className="text-base font-bold mt-0.5 pr-4" style={{ color: "#F9FAFB" }}>
                      {openAlert.title}
                    </h3>
                  </div>
                </div>
                <button
                  onClick={() => setOpenAlert(null)}
                  className="p-1.5 rounded-lg transition-all flex-shrink-0 cursor-pointer"
                  style={{ color: "#6B7280" }}
                  onMouseEnter={e => e.currentTarget.style.color = "#F9FAFB"}
                  onMouseLeave={e => e.currentTarget.style.color = "#6B7280"}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Modal body */}
              <div className="p-5 space-y-4">
                {openAlert.image_url && (
                  <img
                    src={openAlert.image_url}
                    alt="Alert Banner"
                    className="w-full h-40 object-cover rounded-xl"
                    style={{ border: "1px solid #374151" }}
                  />
                )}

                {/* Description/Headline */}
                <div className="space-y-2">
                  <p className="text-xs font-black uppercase tracking-wider" style={{ color: "#6B7280" }}>Incident Details</p>
                  <p className="text-sm leading-relaxed" style={{ color: "#9CA3AF" }}>
                    {openAlert.title}
                  </p>
                </div>

                {/* Metadata Grid */}
                <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl text-xs" style={{ background: "#111827", border: "1px solid #374151" }}>
                  <div>
                    <p className="font-semibold text-[10px] uppercase tracking-wider" style={{ color: "#6B7280" }}>Location</p>
                    <p className="font-bold mt-0.5" style={{ color: "#F9FAFB" }}>{openAlert.country || "Global"}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-[10px] uppercase tracking-wider" style={{ color: "#6B7280" }}>Published</p>
                    <p className="font-bold mt-0.5" style={{ color: "#F9FAFB" }}>{formatDate(openAlert.published)}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-[10px] uppercase tracking-wider" style={{ color: "#6B7280" }}>Source Provider</p>
                    <p className="font-bold mt-0.5" style={{ color: "#F9FAFB" }}>{openAlert.source || "GEO_RISK_ENGINE"}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-[10px] uppercase tracking-wider" style={{ color: "#6B7280" }}>Intelligence Metrics</p>
                    <p className="font-bold mt-0.5" style={{ color: "#F9FAFB" }}>
                      Intensity: {openAlert.intensity != null ? (openAlert.intensity * 100).toFixed(0) : "N/A"}% 
                      {openAlert.confidence != null ? ` (Conf: ${(openAlert.confidence * 100).toFixed(0)}%)` : ""}
                    </p>
                  </div>
                  {openAlert.lat != null && openAlert.lon != null && (
                    <div className="col-span-2">
                      <p className="font-semibold text-[10px] uppercase tracking-wider" style={{ color: "#6B7280" }}>Coordinates</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <MapPin size={11} style={{ color: "#6B7280" }} />
                        <span className="font-mono text-[11px]" style={{ color: "#E5E7EB" }}>
                          {openAlert.lat.toFixed(5)}, {openAlert.lon.toFixed(5)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {openAlert.source_url && (
                  <a
                    href={openAlert.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-bold transition-all"
                    style={{ background: "#00C2FF", color: "#0F172A" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#00A3D9"}
                    onMouseLeave={e => e.currentTarget.style.background = "#00C2FF"}
                  >
                    Access Intelligence Source <ExternalLink size={13} />
                  </a>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default NotificationsPage;
