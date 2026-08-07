import { Outlet, Link, useNavigate } from 'react-router-dom';
import { AppBar, Toolbar, Typography, Button, Box, Container } from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';

const PublicLayout = () => {
  const { isAuthenticated, role, name, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AppBar position="sticky" elevation={0}>
        <Toolbar sx={{ px: { xs: 2, md: 4 }, gap: 1 }}>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontWeight: 700, letterSpacing: '-0.02em' }}>
            Kyllang
          </Typography>
          <Button variant="text" component={Link} to="/">
            Home
          </Button>
          <Button variant="text" component={Link} to="/verify">
            Verify Certificate
          </Button>
          
          {isAuthenticated ? (
            <>
              <Typography variant="body2" sx={{ mx: 1.5, color: 'text.secondary', fontWeight: 600 }}>
                Welcome, {name} ({role})
              </Typography>
              <Button variant="outlined" onClick={handleLogout} size="small">
                Logout
              </Button>
            </>
          ) : (
            <Button variant="contained" component={Link} to="/login" size="small">
              Login
            </Button>
          )}
        </Toolbar>
      </AppBar>

      <Container component="main" maxWidth="xl" sx={{ flexGrow: 1, py: { xs: 3, md: 4 } }}>
        <Outlet />
      </Container>

      <Box component="footer" sx={{ py: 3, px: 2, mt: 'auto', bgcolor: 'background.paper', borderTop: '1px solid', borderColor: 'divider' }}>
        <Typography variant="body2" color="text.secondary" align="center">
          © {new Date().getFullYear()} Medical Certificate System
        </Typography>
      </Box>
    </Box>
  );
};

export default PublicLayout;