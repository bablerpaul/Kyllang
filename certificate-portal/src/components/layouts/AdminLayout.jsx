import { Outlet, Link } from 'react-router-dom';
import { AppBar, Toolbar, Typography, Button, Box, Container } from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';

const AdminLayout = () => {
  const { logout, name } = useAuth();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AppBar position="sticky" elevation={0}>
        <Toolbar sx={{ px: { xs: 2, md: 4 }, gap: 1 }}>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontWeight: 700, letterSpacing: '-0.02em' }}>
            Admin Portal - Medical Certificate System
          </Typography>
          <Typography variant="body2" sx={{ mx: 1.5, color: 'text.secondary', fontWeight: 600 }}>
            Welcome, {name} (Hospital Admin)
          </Typography>
          <Button variant="text" component={Link} to="/admin/dashboard">
            Dashboard
          </Button>
          <Button variant="text" component={Link} to="/admin/users">
            User Management
          </Button>
          <Button variant="text" component={Link} to="/emr-dashboard">
            EMR Dashboard
          </Button>

          <Button variant="outlined" onClick={logout}>
            Logout
          </Button>
        </Toolbar>
      </AppBar>

      <Container component="main" maxWidth="xl" sx={{ py: { xs: 3, md: 4 }, flexGrow: 1 }}>
        <Typography variant="h4" gutterBottom sx={{ fontWeight: 700, mb: 3 }}>
          Hospital Admin Dashboard
        </Typography>
        <Outlet />
      </Container>
    </Box>
  );
};

export default AdminLayout;