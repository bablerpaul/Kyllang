import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  IconButton,
  Divider,
  Avatar,
  Chip
} from '@mui/material';
import {
  Menu,
  Dashboard,
  People,
  MedicalServices,
  History,
  CalendarToday,
  Home,
  Logout,
  VerifiedUser
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { useState } from 'react';

const drawerWidth = 240;

const DoctorLayout = () => {
  const { logout, name } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const menuItems = [
    { text: 'Dashboard', icon: <Dashboard />, path: '/doctor/dashboard' },
    { text: 'My Patients', icon: <People />, path: '/doctor/patients' },
    { text: 'EHR Records', icon: <VerifiedUser />, path: '/doctor/health-records' },
    { text: 'Appointments', icon: <CalendarToday />, path: '/doctor/appointments' },
    { text: 'Prescriptions', icon: <MedicalServices />, path: '/doctor/prescriptions' },
    { text: 'Lab Reports', icon: <History />, path: '/doctor/lab-reports' },
    { text: 'Issue Certificates', icon: <MedicalServices />, path: '/doctor/issue' },
    { text: 'Requests', icon: <CalendarToday />, path: '/doctor/requests' },
    { text: 'History', icon: <History />, path: '/doctor/history' }
  ];

  const drawer = (
    <Box sx={{ height: '100%', bgcolor: 'background.paper' }}>
      <Box sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Avatar sx={{ bgcolor: 'primary.main', width: 40, height: 40 }}>
          <VerifiedUser />
        </Avatar>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>{name || 'Doctor'}</Typography>
          <Chip label="Doctor" size="small" color="primary" sx={{ mt: 0.5 }} />
        </Box>
      </Box>
      <Divider />
      <List sx={{ py: 1 }}>
        {menuItems.map((item) => (
          <ListItem key={item.text} disablePadding>
            <ListItemButton
              component={Link}
              to={item.path}
              selected={location.pathname === item.path}
              onClick={() => setMobileOpen(false)}
            >
            <ListItemIcon>{item.icon}</ListItemIcon>
            <ListItemText primary={item.text} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
      <Divider />
      <List sx={{ py: 1 }}>
        <ListItem disablePadding>
          <ListItemButton component={Link} to="/" onClick={() => setMobileOpen(false)}>
            <ListItemIcon><Home /></ListItemIcon>
            <ListItemText primary="Home" />
          </ListItemButton>
        </ListItem>
        <ListItem disablePadding>
          <ListItemButton onClick={handleLogout}>
            <ListItemIcon><Logout /></ListItemIcon>
            <ListItemText primary="Logout" />
          </ListItemButton>
        </ListItem>
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          ml: { sm: `${drawerWidth}px` },
        }}
      >
        <Toolbar sx={{ px: { xs: 2, md: 3 }, gap: 2 }}>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { sm: 'none' } }}
          >
            <Menu />
          </IconButton>
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1, fontWeight: 700 }}>
            Kyllang - Doctor Section
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Chip
              label="Doctor"
              color="primary"
              size="small"
            />
            <Button variant="text" component={Link} to="/doctor/dashboard">
              Dashboard
            </Button>
            <Button variant="outlined" onClick={handleLogout}>
              Logout
            </Button>
          </Box>
        </Toolbar>
      </AppBar>

      <Box
        component="nav"
        sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}
      >
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
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 2, md: 3 },
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          mt: 8,
          bgcolor: 'background.default',
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
};

export default DoctorLayout;