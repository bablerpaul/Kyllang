import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

const ProtectedRoute = ({ allowedRoles }) => {
  const { isAuthenticated, role } = useAuth();

  // If not authenticated, redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // If role is not allowed, redirect to appropriate dashboard or home
  if (allowedRoles && !allowedRoles.includes(role)) {
    // Redirect to role-specific dashboard if logged in with different role
    switch (role) {
      case 'general_user':
        return <Navigate to="/user/dashboard" replace />;
      case 'doctor':
        return <Navigate to="/doctor/dashboard" replace />;
      case 'hospital_admin':
        return <Navigate to="/admin/dashboard" replace />;
      default:
        return <Navigate to="/" replace />;
    }
  }

  // If authorized, render the child routes
  return <Outlet />;
};

export default ProtectedRoute;