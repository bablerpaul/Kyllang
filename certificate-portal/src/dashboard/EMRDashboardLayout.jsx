import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { apiFetch } from '../utils/api';
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  List,
  Typography,
  Divider,
  IconButton,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Avatar,
  Menu,
  MenuItem,
  Chip,
  Badge,
  Tooltip,
  useTheme,
  useMediaQuery,
} from '@mui/material';

// Icons
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import MedicalServicesOutlinedIcon from '@mui/icons-material/MedicalServicesOutlined';
import FolderSharedOutlinedIcon from '@mui/icons-material/FolderSharedOutlined';
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import NotificationsOutlinedIcon from '@mui/icons-material/NotificationsOutlined';
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import LogoutIcon from '@mui/icons-material/Logout';
import MenuIcon from '@mui/icons-material/Menu';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import PlayCircleOutlinedIcon from '@mui/icons-material/PlayCircleOutlined';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import AssignmentIndOutlinedIcon from '@mui/icons-material/AssignmentIndOutlined';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import ManageAccountsOutlinedIcon from '@mui/icons-material/ManageAccountsOutlined';
import BarChartOutlinedIcon from '@mui/icons-material/BarChartOutlined';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined';
import ApprovalOutlinedIcon from '@mui/icons-material/ApprovalOutlined';
import HealthAndSafetyOutlinedIcon from '@mui/icons-material/HealthAndSafetyOutlined';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import ChecklistOutlinedIcon from '@mui/icons-material/ChecklistOutlined';

import { useAuth } from '../contexts/AuthContext';

const drawerWidth = 268;

// ── Role-aware menu definitions ────────────────────────────────────────────
const COMMON_ITEMS = [
  { text: 'Overview', icon: <DashboardOutlinedIcon />, path: '/dashboard' },
];

const ADMIN_ITEMS = [
  { text: 'User Management',   icon: <ManageAccountsOutlinedIcon />, path: '/dashboard/users' },
  { text: 'Doctor Assignment', icon: <AssignmentIndOutlinedIcon />,  path: '/dashboard/assignments' },
  { text: 'Document Upload',   icon: <CloudUploadOutlinedIcon />,    path: '/dashboard/documents' },
  { text: 'Patients',          icon: <PeopleAltOutlinedIcon />,      path: '/dashboard/patients' },
  { text: 'Doctors',           icon: <MedicalServicesOutlinedIcon />,path: '/dashboard/doctors' },
  { text: 'EMR Records',       icon: <FolderSharedOutlinedIcon />,   path: '/dashboard/emr' },
  { text: 'Appointments',      icon: <EventNoteOutlinedIcon />,      path: '/dashboard/appointments' },
  { text: 'Lab Reports',       icon: <ScienceOutlinedIcon />,        path: '/dashboard/lab-reports' },
  { text: 'Certificates',      icon: <VerifiedUserOutlinedIcon />,   path: '/dashboard/certificates' },
  { text: 'Insurance Claims',  icon: <ShieldOutlinedIcon />,         path: '/dashboard/insurance' },
  { text: 'ZK QR Verification',icon: <QrCodeScannerIcon />,          path: '/dashboard/qr-verify' },
  { text: 'Analytics',         icon: <BarChartOutlinedIcon />,       path: '/dashboard/analytics' },
  { text: 'Audit Logs',        icon: <ReceiptLongOutlinedIcon />,    path: '/dashboard/audit-logs' },
  { text: 'Emergency Access',  icon: <LocalHospitalIcon style={{ color: '#d9534f' }} />, path: '/dashboard/emergency-access' },
];

const DOCTOR_ITEMS = [
  { text: 'My Patients',       icon: <PeopleAltOutlinedIcon />,      path: '/dashboard/my-patients' },
  { text: 'EMR Records',       icon: <FolderSharedOutlinedIcon />,   path: '/dashboard/emr' },
  { text: 'Appointments',      icon: <EventNoteOutlinedIcon />,      path: '/dashboard/appointments' },
  { text: 'Prescriptions',     icon: <ChecklistOutlinedIcon />,      path: '/dashboard/prescriptions' },
  { text: 'Lab Reports',       icon: <ScienceOutlinedIcon />,        path: '/dashboard/lab-reports' },
  { text: 'Issue Certificates',icon: <WorkspacePremiumOutlinedIcon />,path: '/dashboard/issue' },
  { text: 'Cert Requests',     icon: <ApprovalOutlinedIcon />,       path: '/dashboard/requests' },
  { text: 'View Documents',    icon: <FolderOpenOutlinedIcon />,     path: '/dashboard/view-documents' },
  { text: 'ZK QR Verification',icon: <QrCodeScannerIcon />,          path: '/dashboard/qr-verify' },
  { text: 'Emergency Access',  icon: <LocalHospitalIcon style={{ color: '#d9534f' }} />, path: '/dashboard/emergency-access' },
];

const USER_ITEMS = [
  { text: 'My Health Records', icon: <HealthAndSafetyOutlinedIcon />,path: '/dashboard/health-records' },
  { text: 'My Documents',      icon: <FolderOpenOutlinedIcon />,     path: '/dashboard/my-documents' },
  { text: 'Appointments',      icon: <EventNoteOutlinedIcon />,      path: '/dashboard/appointments' },
  { text: 'Prescriptions',     icon: <ChecklistOutlinedIcon />,      path: '/dashboard/prescriptions' },
  { text: 'Lab Reports',       icon: <ScienceOutlinedIcon />,        path: '/dashboard/lab-reports' },
  { text: 'My Certificates',   icon: <VerifiedUserOutlinedIcon />,   path: '/dashboard/my-certificates' },
  { text: 'Request Certificate',icon: <WorkspacePremiumOutlinedIcon />, path: '/dashboard/generate-certificate' },
  { text: 'Approve Requests',  icon: <ApprovalOutlinedIcon />,       path: '/dashboard/approve-requests' },
  { text: 'ZK QR Verification',icon: <QrCodeScannerIcon />,          path: '/dashboard/qr-verify' },
];

const ROLE_LABEL = {
  hospital_admin: 'Hospital Admin',
  doctor: 'Doctor',
  general_user: 'Patient',
};

const ROLE_COLOR = {
  hospital_admin: 'error',
  doctor: 'primary',
  general_user: 'success',
};

export default function EMRDashboardLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const [notifAnchorEl, setNotifAnchorEl] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const { user, role, name, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // Fetch notifications periodically
  useEffect(() => {
    if (role !== 'hospital_admin') return;

    const fetchNotifications = async () => {
      try {
        const res = await apiFetch('/api/admin/notifications');
        if (res?.data) {
          setNotifications(res.data.notifications || []);
          setUnreadCount(res.data.unreadCount || 0);
        }
      } catch (error) {
        console.error('Failed to fetch notifications:', error);
      }
    };

    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000); // every 30s
    return () => clearInterval(interval);
  }, [role]);

  const handleNotifOpen = (e) => setNotifAnchorEl(e.currentTarget);
  const handleNotifClose = () => setNotifAnchorEl(null);

  const handleMarkRead = async (id) => {
    try {
      await apiFetch(`/api/admin/notifications/${id}`, { method: 'PATCH' });
      setNotifications(prev => prev.map(n => n._id === id ? { ...n, read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await apiFetch('/api/admin/notifications/read-all', { method: 'PATCH' });
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  // Build menu based on role
  const roleItems =
    role === 'hospital_admin' ? ADMIN_ITEMS :
    role === 'doctor'         ? DOCTOR_ITEMS :
                                USER_ITEMS;

  const menuItems = [...COMMON_ITEMS, ...roleItems];

  const handleDrawerToggle = () => setMobileOpen(!mobileOpen);
  const handleMenuOpen    = (e) => setAnchorEl(e.currentTarget);
  const handleMenuClose   = () => setAnchorEl(null);
  const handleLogout      = () => { handleMenuClose(); logout(); navigate('/login'); };

  const drawerContent = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'background.paper' }}>
      {/* Brand */}
      <Box sx={{
        p: 2.5,
        display: 'flex', alignItems: 'center', gap: 1.5,
        borderBottom: '1px solid', borderColor: 'divider',
        background: 'linear-gradient(135deg, rgba(37,99,235,0.08) 0%, rgba(99,102,241,0.05) 100%)',
      }}>
        <Avatar sx={{
          background: 'linear-gradient(135deg, #2563EB 0%, #6366F1 100%)',
          width: 42, height: 42, boxShadow: '0 4px 12px rgba(37,99,235,0.3)',
        }}>
          <LocalHospitalIcon sx={{ fontSize: '1.2rem' }} />
        </Avatar>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800, fontSize: '1.05rem', lineHeight: 1.2,
            background: 'linear-gradient(135deg, #2563EB, #6366F1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Kyllang Health
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
            ZK · Blockchain · EMR
          </Typography>
        </Box>
      </Box>

      {/* Role badge */}
      <Box sx={{ px: 2.5, py: 1.2, display: 'flex', alignItems: 'center', gap: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Chip
          label={ROLE_LABEL[role] || 'User'}
          size="small"
          color={ROLE_COLOR[role] || 'default'}
          sx={{ fontWeight: 700, fontSize: '0.68rem', height: 22 }}
        />
        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.72rem' }} noWrap>
          {name || user || ''}
        </Typography>
      </Box>

      {/* Nav list */}
      <List sx={{ px: 1.5, py: 1.5, flexGrow: 1, overflowY: 'auto' }}>
        {menuItems.map((item) => {
          const isSelected =
            item.path === '/dashboard'
              ? location.pathname === '/dashboard'
              : location.pathname.startsWith(item.path);
          return (
            <ListItem key={item.path} disablePadding sx={{ mb: 0.4 }}>
              <ListItemButton
                onClick={() => { navigate(item.path); if (isMobile) setMobileOpen(false); }}
                selected={isSelected}
                sx={{
                  borderRadius: '10px',
                  py: 0.9,
                  color: isSelected ? 'primary.main' : 'text.secondary',
                  bgcolor: isSelected ? 'rgba(37,99,235,0.09)' : 'transparent',
                  '&.Mui-selected': {
                    bgcolor: 'rgba(37,99,235,0.12)',
                    '&:hover': { bgcolor: 'rgba(37,99,235,0.16)' },
                    '& .MuiListItemIcon-root': { color: 'primary.main' },
                  },
                  '&:hover': { bgcolor: 'rgba(37,99,235,0.05)', color: 'primary.main' },
                }}
              >
                <ListItemIcon sx={{ color: isSelected ? 'primary.main' : 'text.secondary', minWidth: 38 }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText
                  primary={item.text}
                  primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: isSelected ? 700 : 500 }}
                />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>

      <Divider />

      {/* User footer */}
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Avatar sx={{ bgcolor: 'primary.main', color: '#fff', fontWeight: 700, width: 36, height: 36, fontSize: '0.9rem' }}>
          {name ? name.charAt(0).toUpperCase() : 'U'}
        </Avatar>
        <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
          <Typography variant="body2" noWrap sx={{ fontWeight: 600, fontSize: '0.85rem' }}>
            {name || 'Authorized User'}
          </Typography>
          <Typography variant="caption" noWrap sx={{ color: 'text.secondary', display: 'block', fontSize: '0.72rem' }}>
            {user || ''}
          </Typography>
        </Box>
        <Tooltip title="Log out">
          <IconButton onClick={handleLogout} sx={{ color: 'error.main' }} size="small">
            <LogoutIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', bgcolor: 'background.default', minHeight: '100vh' }}>
      {/* Top App Bar */}
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          ml: { sm: `${drawerWidth}px` },
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
          color: 'text.primary',
        }}
      >
        <Toolbar sx={{ justifyContent: 'space-between', px: { xs: 2, md: 3 }, minHeight: '60px !important' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconButton
              color="inherit"
              onClick={handleDrawerToggle}
              sx={{ mr: 1, display: { sm: 'none' } }}
            >
              <MenuIcon />
            </IconButton>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                Kyllang Health Platform
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {ROLE_LABEL[role] || 'User'} Portal
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Tooltip title="Notifications">
              <IconButton size="medium" onClick={handleNotifOpen}>
                <Badge badgeContent={unreadCount} color="error">
                  <NotificationsOutlinedIcon />
                </Badge>
              </IconButton>
            </Tooltip>

            {/* Notifications Menu */}
            <Menu
              anchorEl={notifAnchorEl}
              open={Boolean(notifAnchorEl)}
              onClose={handleNotifClose}
              transformOrigin={{ horizontal: 'right', vertical: 'top' }}
              anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
              PaperProps={{ elevation: 3, sx: { mt: 1, minWidth: 320, maxWidth: 360, borderRadius: 2, maxHeight: 400 } }}
            >
              <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid', borderColor: 'divider' }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>System Notifications</Typography>
                {unreadCount > 0 && (
                  <Typography variant="caption" sx={{ color: 'primary.main', cursor: 'pointer', fontWeight: 600 }} onClick={handleMarkAllRead}>
                    Mark all as read
                  </Typography>
                )}
              </Box>
              
              {notifications.length === 0 ? (
                <MenuItem disabled sx={{ py: 3, justifyContent: 'center' }}>
                  <Typography variant="body2" color="text.secondary">No notifications</Typography>
                </MenuItem>
              ) : (
                notifications.map((notif) => (
                  <MenuItem 
                    key={notif._id} 
                    onClick={() => { if (!notif.read) handleMarkRead(notif._id); }}
                    sx={{ 
                      py: 1.5, 
                      px: 2,
                      borderBottom: '1px solid', 
                      borderColor: 'divider',
                      bgcolor: notif.read ? 'transparent' : 'rgba(37,99,235,0.04)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      whiteSpace: 'normal', // Allow text wrapping
                    }}
                  >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', mb: 0.5 }}>
                      <Typography variant="body2" sx={{ fontWeight: notif.read ? 500 : 700, color: notif.type === 'error' ? 'error.main' : notif.type === 'warning' ? 'warning.main' : 'text.primary' }}>
                        {notif.title}
                      </Typography>
                      {!notif.read && <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'primary.main', flexShrink: 0, mt: 0.5 }} />}
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>
                      {notif.message}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.65rem', mt: 0.5 }}>
                      {new Date(notif.createdAt).toLocaleString()}
                    </Typography>
                  </MenuItem>
                ))
              )}
            </Menu>

            <Tooltip title="Account">
              <IconButton onClick={handleMenuOpen} size="small">
                <Avatar sx={{ width: 34, height: 34, bgcolor: 'primary.main', fontSize: '0.85rem', fontWeight: 700 }}>
                  {name ? name.charAt(0).toUpperCase() : 'U'}
                </Avatar>
              </IconButton>
            </Tooltip>

            <Menu
              anchorEl={anchorEl}
              open={Boolean(anchorEl)}
              onClose={handleMenuClose}
              transformOrigin={{ horizontal: 'right', vertical: 'top' }}
              anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
              PaperProps={{ elevation: 3, sx: { mt: 1, minWidth: 180, borderRadius: 2 } }}
            >
              <MenuItem onClick={() => { handleMenuClose(); navigate('/dashboard'); }}>
                <HomeOutlinedIcon sx={{ mr: 1.5, color: 'text.secondary', fontSize: '1.1rem' }} />
                Dashboard
              </MenuItem>
              <Divider />
              <MenuItem onClick={handleLogout} sx={{ color: 'error.main' }}>
                <LogoutIcon sx={{ mr: 1.5, fontSize: '1.1rem' }} /> Log Out
              </MenuItem>
            </Menu>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Nav Drawer */}
      <Box component="nav" sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}>
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
          }}
        >
          {drawerContent}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth, borderRight: '1px solid', borderColor: 'divider' },
          }}
          open
        >
          {drawerContent}
        </Drawer>
      </Box>

      {/* Main Content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 2, md: 3 },
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          mt: '60px',
          bgcolor: 'background.default',
          minHeight: 'calc(100vh - 60px)',
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
}
