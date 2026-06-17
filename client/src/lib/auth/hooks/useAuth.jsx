import { useState, useEffect, createContext, useContext, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

// Configure global Axios settings for RouteGuardian
axios.defaults.baseURL = import.meta.env.VITE_BACKEND_URL || '';
axios.defaults.withCredentials = true;

let csrfTokenMemory = null;

export const fetchCsrfToken = async () => {
  try {
    const backendUrl = import.meta.env.VITE_BACKEND_URL || '';
    const res = await axios.get(`${backendUrl}/api/auth/csrf-token`, { withCredentials: true });
    if (res.data?.csrfToken) {
      csrfTokenMemory = res.data.csrfToken;
    }
  } catch (err) {
    console.warn('[AUTH] Failed to fetch CSRF token from bootstrap endpoint:', err.message);
  }
};
// Request interceptor to attach X-XSRF-TOKEN header on mutating requests
axios.interceptors.request.use(
  (config) => {
    config.withCredentials = true; // Always set credentials for CORS compatibility
    const getCookie = (name) => {
      const value = `; ${document.cookie}`;
      const parts = value.split(`; ${name}=`);
      if (parts.length === 2) return parts.pop().split(';').shift();
      return null;
    };
    const xsrfToken = csrfTokenMemory || getCookie('XSRF-TOKEN');
    if (xsrfToken && ['post', 'put', 'delete', 'patch'].includes(config.method?.toLowerCase())) {
      config.headers['X-XSRF-TOKEN'] = xsrfToken;
      config.headers['X-CSRF-Token'] = xsrfToken;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export const API = axios;

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(null);
  const didInitRef = useRef(false);

  const clearAuthData = useCallback(() => {
    setUser(null);
    setAuthenticated(false);
  }, []);

  const logout = useCallback(async () => {
    setSigningOut('loading');
    try {
      await API.post('/api/auth/logout');
    } catch {
      // Local sign-out should still proceed even if backend logout fails.
    }

    csrfTokenMemory = null;

    // Clear accessible document cookies
    try {
      document.cookie.split(";").forEach((c) => {
        document.cookie = c
          .replace(/^ +/, "")
          .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
      });
    } catch (e) {
      console.warn("Failed to clear document cookies:", e);
    }

    // Clear all storage
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (e) {
      console.warn("Failed to clear storage:", e);
    }

    clearAuthData();
    setSigningOut('success');

    // Wait 800ms for success checkmark animation to display
    await new Promise((resolve) => setTimeout(resolve, 800));
    window.location.replace(window.location.origin + '/');
  }, [clearAuthData]);

  useEffect(() => {
    let isRefreshing = false;
    let failedQueue = [];

    const processQueue = (error) => {
      failedQueue.forEach((prom) => {
        if (error) {
          prom.reject(error);
        } else {
          prom.resolve();
        }
      });
      failedQueue = [];
    };

    const resInt = axios.interceptors.response.use(
      (res) => res,
      async (err) => {
        const originalRequest = err.config;
        const requestUrl = originalRequest?.url || '';
        const isProfileRequest = requestUrl.includes('/api/auth/profile');
        const isRefreshRequest = requestUrl.includes('/api/auth/refresh');

        if (err.response?.status === 429) {
          window.location.href = '/too-many-requests';
          return Promise.reject(err);
        }

        // Silent Refresh if access token expired (401)
        if (err.response?.status === 401 && !isRefreshRequest && !originalRequest._retry) {
          if (isRefreshing) {
            return new Promise((resolve, reject) => {
              failedQueue.push({ resolve, reject });
            })
              .then(() => {
                return axios(originalRequest);
              })
              .catch((err) => {
                return Promise.reject(err);
              });
          }

          originalRequest._retry = true;
          isRefreshing = true;

          try {
            console.info('[AUTH] Access token expired, attempting silent refresh...');
            const refreshRes = await axios.post('/api/auth/refresh', {});
            if (refreshRes.data?.success) {
              console.info('[AUTH] Session refreshed successfully, retrying original request.');
              processQueue(null);
              return axios(originalRequest);
            }
          } catch (refreshErr) {
            console.error('[AUTH] Silent refresh failed:', refreshErr.message);
            processQueue(refreshErr);
            clearAuthData();
            if (!isProfileRequest && window.location.pathname !== '/auth' && window.location.pathname !== '/') {
              window.location.replace('/auth');
            }
            return Promise.reject(refreshErr);
          } finally {
            isRefreshing = false;
          }
        }

        // Default 401 handling if not retrying or refresh failed
        if (err.response?.status === 401) {
          clearAuthData();
          if (isProfileRequest) {
            console.info('[AUTH] No active session');
          } else if (window.location.pathname !== '/auth' && window.location.pathname !== '/') {
            window.location.replace('/auth');
          }
        }

        return Promise.reject(err);
      }
    );

    return () => {
      axios.interceptors.response.eject(resInt);
    };
  }, [clearAuthData]);

  const initAuth = useCallback(async () => {
    console.info('[AUTH] Session restore started');
    try {
      await fetchCsrfToken();
      const res = await API.get('/api/auth/profile');
      if (res.data?.success) {
        setUser(res.data.user);
        setAuthenticated(true);
        console.info('[AUTH] Session restored');
      } else {
        clearAuthData();
      }
    } catch (e) {
      if (e.response?.status === 401) {
        clearAuthData();
      } else if (e.response?.status !== 429) {
        clearAuthData();
      }
    } finally {
      setLoading(false);
    }
  }, [clearAuthData]);

  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    initAuth();
  }, [initAuth]);

  const value = useMemo(
    () => ({ user, authenticated, loading, setUser, logout }),
    [user, authenticated, loading, logout]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      {signingOut && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 99999,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          color: '#ffffff',
          fontFamily: 'Inter, system-ui, sans-serif',
          transition: 'all 0.3s ease-in-out'
        }}>
          <div style={{
            background: 'rgba(30, 41, 59, 0.4)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            padding: '2.5rem 3rem',
            borderRadius: '24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1.5rem',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            textAlign: 'center'
          }}>
            {signingOut === 'loading' ? (
              <>
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  border: '3px solid rgba(6, 182, 212, 0.1)',
                  borderTopColor: '#06b6d4',
                  animation: 'spin 1s linear infinite',
                }} />
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#f8fafc', letterSpacing: '0.025em' }}>Securing Session</h3>
                  <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8', fontWeight: 500 }}>Clearing credentials &amp; logs...</p>
                </div>
              </>
            ) : (
              <>
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '1.5px solid rgba(16, 185, 129, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#10b981',
                }}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" style={{ width: '24px', height: '24px' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#10b981', letterSpacing: '0.025em' }}>Successfully Logged Out</h3>
                  <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8', fontWeight: 500 }}>Redirecting to RouteGuardian secure portal...</p>
                </div>
              </>
            )}
          </div>
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      )}
    </AuthContext.Provider>
  );
};