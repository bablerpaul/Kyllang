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

  // Check backend for valid token on initial load
  useEffect(() => {
    const verifyToken = async () => {
      const token = localStorage.getItem('certificate_portal_token');
      if (token) {
        try {
          const user = await apiFetch('/api/auth/me');
          setAuthState({
            user: user.email,
            role: user.role,
            name: user.name,
            userId: user._id,
          });
        } catch (error) {
          console.error('Invalid or expired token', error);
          localStorage.removeItem('certificate_portal_token');
        }
      }
      setLoading(false);
    };

    verifyToken();
  }, []);

  const register = async (userData) => {
    try {
      const data = await apiFetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(userData),
      });

      localStorage.setItem('certificate_portal_token', data.token);
      setAuthState({
        user: data.email,
        role: data.role,
        name: data.name,
        userId: data._id,
      });

      return { success: true, role: data.role };
    } catch (error) {
      return { success: false, message: error.message };
    }
  };

  const login = async (email, password) => {
    try {
      // In the frontend the login form passes "username". We will treat it as "email".
      const data = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      localStorage.setItem('certificate_portal_token', data.token);
      setAuthState({
        user: data.email,
        role: data.role,
        name: data.name,
        userId: data._id,
      });

      return { success: true, role: data.role, user: data };
    } catch (error) {
      return { success: false, message: error.message };
    }
  };

  const logout = () => {
    setAuthState({ user: null, role: null, name: null, userId: null });
    localStorage.removeItem('certificate_portal_token');

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