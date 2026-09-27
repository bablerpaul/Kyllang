import { createContext, useContext, useState, useEffect } from 'react';
import { apiFetch } from '../utils/api';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [authState, setAuthState] = useState({
    user: null,
    role: null,
    name: null,
    userId: null,
  });
  const [loading, setLoading] = useState(true);

  // Fire-and-forget: GET /api/patient/profile lazily creates the backend Patient
  // profile document if one doesn't exist yet for this user. Priming it once here
  // (on initial session load and right after login/register) means Patient pages
  // that require the Patient profile to already exist (Appointments, Health
  // Records) don't race a brand-new patient's first, profile-less load and surface
  // a spurious "Patient profile not found" error. This never suppresses genuine
  // errors from those pages' own real fetches — it only pre-warms the record.
  const ensurePatientProfile = (role) => {
    if (role !== 'general_user') return;
    apiFetch('/api/patient/profile', { redirectOnAuthFailure: false }).catch(() => {});
  };

  // Check backend for valid session on initial load
  useEffect(() => {
    const verifyToken = async () => {
      try {
        // Passive probe: a logged-out visitor on a public route (e.g. /verify) must NOT be redirected to /login.
        // Protected routes are guarded by <ProtectedRoute>; every other apiFetch call keeps the redirect-on-failure default.
        const response = await apiFetch('/api/auth/me', { redirectOnAuthFailure: false });
        const user = response.data || response;
        setAuthState({
          user: user.email,
          role: user.role,
          name: user.name,
          userId: user._id,
        });
        ensurePatientProfile(user.role);
      } catch (error) {
        console.log('No active session found.');
      }
      setLoading(false);
    };

    verifyToken();
  }, []);

  const register = async (userData) => {
    try {
      const response = await apiFetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(userData),
      });
      
      const userPayload = response.data || response;

      setAuthState({
        user: userPayload.email,
        role: userPayload.role,
        name: userPayload.name,
        userId: userPayload._id,
      });
      ensurePatientProfile(userPayload.role);

      return { success: true, role: userPayload.role };
    } catch (error) {
      return { success: false, message: error.message };
    }
  };

  const login = async (email, password) => {
    try {
      // In the frontend the login form passes "username". We will treat it as "email".
      const response = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      const userPayload = response.data || response;

      setAuthState({
        user: userPayload.email,
        role: userPayload.role,
        name: userPayload.name,
        userId: userPayload._id,
      });
      ensurePatientProfile(userPayload.role);

      return { success: true, role: userPayload.role, user: userPayload };
    } catch (error) {
      return { success: false, message: error.message };
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch (err) {
      console.error('Logout request failed:', err);
    }

    setAuthState({ user: null, role: null, name: null, userId: null });

    // Clear any role-specific data
    localStorage.removeItem('system_patients');
    localStorage.removeItem('system_doctors');
    localStorage.removeItem('system_admins');
  };

  const verifyCertificate = async (hashData) => {
    try {
      // Safely extract hash and data from the scanned/uploaded payload
      let hash = hashData;
      let data = {};

      if (typeof hashData === 'object' && hashData !== null) {
        hash = hashData.hash || hashData.verificationHash || hashData.id || hashData;

        // If the payload has a nested `data` property, use it.
        // Otherwise, if hashData contains patientId directly, assume hashData IS the data
        if (hashData.data && typeof hashData.data === 'object') {
          data = hashData.data;
        } else if (hashData.patientId || hashData.diagnosis) {
          data = hashData;
          // Create a clean copy without the hash appended
          data = { ...hashData };
          delete data.hash;
          delete data.verificationHash;
        } else {
          // Backup parsing attempt if stringified
          try {
            if (typeof hashData.data === 'string') data = JSON.parse(hashData.data);
          } catch (e) {
            data = {};
          }
        }
      }

      const cert = await apiFetch(`/api/certificates/verify`, {
        method: 'POST',
        body: JSON.stringify({ hash, data })
      });

      return {
        valid: true,
        message: 'Certificate successfully verified',
        data: cert,
      };
    } catch (error) {
      return {
        valid: false,
        message: error.message || 'Invalid or tampered certificate',
      };
    }
  };

  if (loading) return null; // Or a loading spinner

  return (
    <AuthContext.Provider
      value={{
        ...authState,
        login,
        register,
        logout,
        verifyCertificate,
        isAuthenticated: !!authState.user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};