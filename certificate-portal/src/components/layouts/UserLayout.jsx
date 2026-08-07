import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { 
  AppBar, 
  Toolbar, 
  Typography, 
  Button, 
  Box, 
  Container,
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
  AddCircle,
  CheckCircle,
  History,
  Settings,
  Logout,
  Home,
  VerifiedUser
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { useState } from 'react';

const drawerWidth = 240;

const UserLayout = () => {
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
    { text: 'Dashboard', icon: <Dashboard />, path: '/user/dashboard' },
    { text: 'My Profile & History', icon: <VerifiedUser />, path: '/user/profile' },
    { text: 'Health Records (EHR)', icon: <VerifiedUser />, path: '/user/health-records' },
    { text: 'Appointments', icon: <History />, path: '/user/appointments' },
    { text: 'Prescriptions', icon: <AddCircle />, path: '/user/prescriptions' },
    { text: 'Lab Reports', icon: <CheckCircle />, path: '/user/lab-reports' },
    { text: 'Generate Certificates', icon: <AddCircle />, path: '/user/dashboard?tab=0' },
    { text: 'Approve Requests', icon: <CheckCircle />, path: '/user/dashboard?tab=1' },
    { text: 'Certificate History', icon: <History />, path: '/user/certificates' },
    { text: 'Settings', icon: <Settings />, path: '/user/settings' },
  ];

  const drawer = (
    <Box sx={{ height: '100%', bgcolor: 'background.paper' }}>
      <Box sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Avatar sx={{ bgcolor: 'primary.main', width: 40, height: 40 }}>
          <VerifiedUser />
        </Avatar>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>{name}</Typography>
          <Chip label="General User" size="small" color="primary" sx={{ mt: 0.5 }} />
        </Box>
      </Box>
      <Divider />
      <List sx={{ py: 1 }}>
        {menuItems.map((item) => (
          <ListItem key={item.text} disablePadding>
            <ListItemButton
              component={Link}
              to={item.path}
              selected={location.pathname === item.path.split('?')[0]}
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
      {/* App Bar */}
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
            Kyllang - User Section
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Button variant="text" component={Link} to="/verify">
              Verify Certificate
            </Button>
            <Chip 
              label="General User" 
              color="primary" 
              size="small"
            />
          </Box>
        </Toolbar>
      </AppBar>

      {/* Sidebar Drawer */}
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

      {/* Main Content */}
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

export default UserLayout;