import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
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
} from '@mui/material';

// Material UI Icons
import DashboardIcon from '@mui/icons-material/Dashboard';
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

import { useAuth } from '../contexts/AuthContext';

const drawerWidth = 260;

const menuItems = [
  { text: 'Dashboard', icon: <DashboardOutlinedIcon />, path: '/emr-dashboard' },
  { text: 'Connected EMR Flow', icon: <PlayCircleOutlinedIcon />, path: '/emr-dashboard/workflow' },
  { text: 'Patients', icon: <PeopleAltOutlinedIcon />, path: '/emr-dashboard/patients' },
  { text: 'Doctors', icon: <MedicalServicesOutlinedIcon />, path: '/emr-dashboard/doctors' },
  { text: 'EMR Records', icon: <FolderSharedOutlinedIcon />, path: '/emr-dashboard/emr' },
  { text: 'Appointments', icon: <EventNoteOutlinedIcon />, path: '/emr-dashboard/appointments' },
  { text: 'Lab Reports', icon: <ScienceOutlinedIcon />, path: '/emr-dashboard/lab-reports' },
  { text: 'Medical Certificates', icon: <VerifiedUserOutlinedIcon />, path: '/emr-dashboard/certificates' },
  { text: 'Insurance Claims', icon: <ShieldOutlinedIcon />, path: '/emr-dashboard/insurance' },
  { text: 'Consent Controls', icon: <VerifiedUserOutlinedIcon />, path: '/emr-dashboard/consent' },
  { text: 'QR Verification', icon: <QrCodeScannerIcon />, path: '/emr-dashboard/qr-verify' },
  { text: 'Audit Logs', icon: <ReceiptLongOutlinedIcon />, path: '/emr-dashboard/audit-logs' },
];

export default function EMRDashboardLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleMenuOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = () => {
    handleMenuClose();
    logout();
    navigate('/login');
  };

  const drawerContent = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'background.paper', color: 'text.primary' }}>
      {/* Brand Header */}
      <Box sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Avatar sx={{ bgcolor: 'primary.main', width: 40, height: 40 }}>
          <LocalHospitalIcon />
        </Avatar>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.1rem', lineHeight: 1.2 }}>
            MediChain EMR
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Blockchain Health System
          </Typography>
        </Box>
      </Box>

      {/* Role Badge */}
      <Box sx={{ px: 2.5, py: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Chip
          label={user?.role ? user.role.toUpperCase() : 'HEALTH SYSTEM'}
          size="small"
          sx={{
            bgcolor: user?.role === 'doctor' ? 'primary.main' : user?.role === 'admin' ? 'secondary.main' : 'success.main',
            color: '#ffffff',
            fontWeight: 600,
            fontSize: '0.7rem',
          }}
        />
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          Ganache On-Chain
        </Typography>
      </Box>

      {/* Navigation List */}
      <List sx={{ px: 1.5, py: 1, flexGrow: 1 }}>
        {menuItems.map((item) => {
          const isSelected = location.pathname === item.path || (item.path !== '/emr-dashboard' && location.pathname.startsWith(item.path));
          return (
            <ListItem key={item.text} disablePadding sx={{ mb: 0.5 }}>
              <ListItemButton
                onClick={() => navigate(item.path)}
                selected={isSelected}
                sx={{
                  borderRadius: '10px',
                  color: isSelected ? 'primary.main' : 'text.secondary',
                  bgcolor: isSelected ? 'rgba(37, 99, 235, 0.08)' : 'transparent',
                  '&.Mui-selected': {
                    bgcolor: 'rgba(37, 99, 235, 0.12)',
                    color: 'primary.main',
                    '&:hover': { bgcolor: 'rgba(37, 99, 235, 0.16)' },
                    '& .MuiListItemIcon-root': { color: 'primary.main' },
                  },
                  '&:hover': {
                    bgcolor: 'rgba(37, 99, 235, 0.05)',
                    color: 'primary.main',
                  },
                }}
              >
                <ListItemIcon sx={{ color: isSelected ? 'primary.main' : 'text.secondary', minWidth: 40 }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText
                  primary={item.text}
                  primaryTypographyProps={{ fontSize: '0.9rem', fontWeight: isSelected ? 600 : 500 }}
                />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>

      <Divider sx={{ borderColor: 'divider' }} />

      {/* User Footer */}
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Avatar sx={{ bgcolor: 'primary.main', color: '#ffffff', fontWeight: 700 }}>
          {user?.name ? user.name.charAt(0) : 'U'}
        </Avatar>
        <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
          <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
            {user?.name || 'Authorized User'}
          </Typography>
          <Typography variant="caption" noWrap sx={{ color: 'text.secondary', display: 'block' }}>
            {user?.email || 'user@medichain.org'}
          </Typography>
        </Box>
        <IconButton onClick={handleLogout} sx={{ color: 'error.main' }}>
          <LogoutIcon fontSize="small" />
        </IconButton>
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
        }}
      >
        <Toolbar sx={{ justifyContent: 'space-between', px: { xs: 2, md: 3 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconButton
              color="inherit"
              aria-label="open drawer"
              edge="start"
              onClick={handleDrawerToggle}
              sx={{ mr: 2, display: { sm: 'none' } }}
            >
              <MenuIcon />
            </IconButton>
            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.1rem' }}>
              Hospital EMR Platform
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Tooltip title="Notifications">
              <IconButton color="inherit" size="large">
                <Badge badgeContent={3} color="primary">
                  <NotificationsOutlinedIcon />
                </Badge>
              </IconButton>
            </Tooltip>

            <Tooltip title="Account Settings">
              <IconButton onClick={handleMenuOpen} size="small" sx={{ ml: 1 }}>
                <Avatar sx={{ width: 36, height: 36, bgcolor: 'primary.main', fontSize: '0.9rem' }}>
                  {user?.name ? user.name.charAt(0) : 'U'}
                </Avatar>
              </IconButton>
            </Tooltip>

            <Menu
              anchorEl={anchorEl}
              open={Boolean(anchorEl)}
              onClose={handleMenuClose}
              transformOrigin={{ horizontal: 'right', vertical: 'top' }}
              anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
            >
              <MenuItem onClick={() => { handleMenuClose(); navigate('/user/profile'); }}>
                <AccountCircleOutlinedIcon sx={{ mr: 1.5, color: 'text.secondary' }} /> Profile Settings
              </MenuItem>
              <Divider />
              <MenuItem onClick={handleLogout} sx={{ color: 'error.main' }}>
                <LogoutIcon sx={{ mr: 1.5 }} /> Log Out
              </MenuItem>
            </Menu>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Navigation Drawer */}
      <Box
        component="nav"
        sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}
      >
        {/* Mobile Drawer */}
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

        {/* Desktop Permanent Drawer */}
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth, borderRight: 'none' },
          }}
          open
        >
          {drawerContent}
        </Drawer>
      </Box>

      {/* Main Page Area */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 2, md: 3 },
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          mt: 8,
          bgcolor: 'background.default',
          minHeight: 'calc(100vh - 64px)',
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
}
