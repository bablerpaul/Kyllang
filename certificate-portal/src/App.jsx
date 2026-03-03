import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';

// Layouts
import PublicLayout from './components/layouts/PublicLayout';
import UserLayout from './components/layouts/UserLayout';
import DoctorLayout from './components/layouts/DoctorLayout';
import AdminLayout from './components/layouts/AdminLayout';

// Pages
import LandingPage from './components/pages/LandingPage';
import LoginPage from './components/pages/LoginPage';
import VerifyCertificate from './components/pages/VerifyCertificate';

// User Dashboard
import UserDashboard from './components/pages/user/UserDashboard';
import MyCertificates from './components/pages/user/MyCertificates';

// Doctor Components
import DoctorDashboard from './components/pages/doctor/DoctorDashboard';
import PatientDetail from './components/pages/doctor/PatientDetail';
import DocumentViewer from './components/pages/doctor/DocumentViewer';
import DoctorPatients from './components/pages/doctor/DoctorPatients';
import IssueCertificates from './components/pages/doctor/IssueCertificates';
import DoctorRequests from './components/pages/doctor/DoctorRequests';
import DoctorHistory from './components/pages/doctor/DoctorHistory';

// Import Admin Components
import AdminDashboard from './components/pages/admin/AdminDashboard';
import UserManagement from './components/pages/admin/UserManagement';
import DoctorAssignment from './components/pages/admin/DoctorAssignment';
import DocumentUpload from './components/pages/admin/DocumentUpload';
import SystemAnalytics from './components/pages/admin/SystemAnalytics';

// Protected Route
import ProtectedRoute from './components/protected/ProtectedRoute';

// Import MUI components
import { Typography, Box, Alert, Paper } from '@mui/material';

function App() {
  const { isAuthenticated, role } = useAuth();

  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<PublicLayout />}>
        <Route index element={<LandingPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="verify" element={<VerifyCertificate />} />
      </Route>

      {/* Protected user routes */}
      <Route
        path="/user"
        element={
          <ProtectedRoute allowedRoles={['general_user']} />
        }
      >
        <Route element={<UserLayout />}>
          <Route path="dashboard" element={<UserDashboard />} />
          <Route path="certificates" element={<MyCertificates />} />
          <Route path="settings" element={
            <Box sx={{ p: 3 }}>
              <Typography variant="h4" gutterBottom>
                Settings
              </Typography>
              <Alert severity="info">
                User settings and preferences will be available here.
              </Alert>
            </Box>
          } />
          <Route index element={<Navigate to="dashboard" replace />} />
        </Route>
      </Route>

      {/* Protected doctor routes */}
      <Route
        path="/doctor"
        element={
          <ProtectedRoute allowedRoles={['doctor']} />
        }
      >
        <Route element={<DoctorLayout />}>
          <Route path="dashboard" element={<DoctorDashboard />} />
          <Route path="patient/:id" element={<PatientDetail />} />
          <Route path="document/:docId" element={<DocumentViewer />} />
          <Route path="patients" element={<DoctorPatients />} />
          <Route path="issue" element={<IssueCertificates />} />
          <Route path="requests" element={<DoctorRequests />} />
          <Route path="history" element={<DoctorHistory />} />
          <Route index element={<Navigate to="dashboard" replace />} />
        </Route>
      </Route>

      {/* Protected admin routes */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={['hospital_admin']} />
        }
      >
        <Route element={<AdminLayout />}>
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="users" element={<UserManagement />} />
          <Route path="assignments" element={<DoctorAssignment />} />
          <Route path="documents" element={<DocumentUpload />} />
          <Route path="analytics" element={<SystemAnalytics />} />
          <Route index element={<Navigate to="dashboard" replace />} />
        </Route>
      </Route>

      {/* Catch all - redirect to home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;