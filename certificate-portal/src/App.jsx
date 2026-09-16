import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';

// Layouts
import PublicLayout from './components/layouts/PublicLayout';

// Public Pages
import LandingPage from './components/pages/LandingPage';
import LoginPage from './components/pages/LoginPage';
import VerifyCertificate from './components/pages/VerifyCertificate';

// Protected Route
import ProtectedRoute from './components/protected/ProtectedRoute';

// Unified Dashboard Layout (role-aware)
import EMRDashboardLayout from './dashboard/EMRDashboardLayout';

// ── Shared dashboard pages ──────────────────────────────────────────────────
import DashboardOverview from './dashboard/pages/DashboardOverview';
import PatientsManager from './dashboard/pages/PatientsManager';
import DoctorsManager from './dashboard/pages/DoctorsManager';
import EMRManager from './dashboard/pages/EMRManager';
import AppointmentsManager from './dashboard/pages/AppointmentsManager';
import LabReportsManager from './dashboard/pages/LabReportsManager';
import CertificatesManager from './dashboard/pages/CertificatesManager';
import InsuranceManager from './dashboard/pages/InsuranceManager';
import AuditLogsManager from './dashboard/pages/AuditLogsManager';
import QRVerificationManager from './dashboard/pages/QRVerificationManager';

// ── Admin-specific pages ────────────────────────────────────────────────────
import UserManagement from './components/pages/admin/UserManagement';
import DoctorAssignment from './components/pages/admin/DoctorAssignment';
import DocumentUpload from './components/pages/admin/DocumentUpload';
import SystemAnalytics from './components/pages/admin/SystemAnalytics';

// ── Doctor-specific pages ───────────────────────────────────────────────────
import DoctorPatients from './components/pages/doctor/DoctorPatients';
import PatientDetail from './components/pages/doctor/PatientDetail';
import DocumentViewer from './components/pages/doctor/DocumentViewer';
import IssueCertificates from './components/pages/doctor/IssueCertificates';
import DoctorRequests from './components/pages/doctor/DoctorRequests';
import CertificateRequests from './components/pages/doctor/CertificateRequests';

// ── Patient-specific pages ──────────────────────────────────────────────────
import MyCertificates from './components/pages/user/MyCertificates';
import MyDocuments from './components/pages/user/MyDocuments';
import GenerateCertificate from './components/pages/user/GenerateCertificate';
import ApproveRequests from './components/pages/user/ApproveRequests';
import PatientKeyEnrollment from './components/pages/user/PatientKeyEnrollment';

// ── EMR module pages (shared across roles) ──────────────────────────────────
import HealthRecords from './modules/emr/pages/HealthRecords';
import Appointments from './modules/emr/pages/Appointments';
import Prescriptions from './modules/emr/pages/Prescriptions';
import LabReports from './modules/emr/pages/LabReports';
import PatientProfile from './modules/emr/pages/PatientProfile';

// Misc
import EmergencyAccess from './components/pages/EmergencyAccess';
import { Box, Alert, Typography } from '@mui/material';

function App() {
  const { isAuthenticated, role } = useAuth();

  return (
    <Routes>
      {/* ── Public routes ──────────────────────────────────────────────── */}
      <Route path="/" element={<PublicLayout />}>
        <Route index element={<LandingPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="verify" element={<VerifyCertificate />} />
      </Route>

      {/* ── Unified Dashboard (all roles) ───────────────────────────────── */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute
            allowedRoles={['hospital_admin', 'doctor', 'general_user', 'insurance_officer']}
          />
        }
      >
        <Route element={<EMRDashboardLayout />}>
          {/* Common pages */}
          <Route index element={<DashboardOverview />} />
          <Route path="qr-verify" element={<QRVerificationManager />} />
          <Route path="appointments" element={<AppointmentsManager />} />
          <Route path="lab-reports" element={<LabReportsManager />} />
          <Route path="emr" element={<EMRManager />} />
          <Route path="prescriptions" element={<Prescriptions />} />
          <Route path="health-records" element={<HealthRecords />} />

          {/* Admin pages */}
          <Route path="users" element={<UserManagement />} />
          <Route path="assignments" element={<DoctorAssignment />} />
          <Route path="documents" element={<DocumentUpload />} />
          <Route path="analytics" element={<SystemAnalytics />} />
          <Route path="patients" element={<PatientsManager />} />
          <Route path="doctors" element={<DoctorsManager />} />
          <Route path="certificates" element={<CertificatesManager />} />
          <Route path="insurance" element={<InsuranceManager />} />
          <Route path="audit-logs" element={<AuditLogsManager />} />

          {/* Doctor pages */}
          <Route path="my-patients" element={<DoctorPatients />} />
          <Route path="patient/:id" element={<PatientDetail />} />
          <Route path="view-documents" element={<DocumentViewer />} />
          <Route path="document/:docId" element={<DocumentViewer />} />
          <Route path="issue" element={<IssueCertificates />} />
          <Route path="requests" element={<CertificateRequests />} />
          <Route path="emergency-access" element={<EmergencyAccess />} />

          {/* Patient pages */}
          <Route path="my-documents" element={<MyDocuments />} />
          <Route path="my-certificates" element={<MyCertificates />} />
          <Route path="generate-certificate" element={<GenerateCertificate />} />
          <Route path="approve-requests" element={<ApproveRequests />} />
          <Route path="profile" element={<PatientProfile />} />
          <Route path="key-enrollment" element={<PatientKeyEnrollment />} />

          {/* Settings placeholder */}
          <Route path="settings" element={
            <Box sx={{ p: 3 }}>
              <Typography variant="h4" gutterBottom>Settings</Typography>
              <Alert severity="info">User settings and preferences will be available here.</Alert>
            </Box>
          } />
        </Route>
      </Route>

      {/* ── Legacy role-specific routes → redirect to unified dashboard ── */}
      <Route path="/admin/*" element={<Navigate to="/dashboard" replace />} />
      <Route path="/doctor/*" element={<Navigate to="/dashboard" replace />} />
      <Route path="/user/*" element={<Navigate to="/dashboard" replace />} />
      <Route path="/emr-dashboard/*" element={<Navigate to="/dashboard" replace />} />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;