import { Link } from 'react-router-dom';
import { 
  Box, 
  Button, 
  Card, 
  CardContent, 
  Typography, 
  Grid,
  Container 
} from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';

const LandingPage = () => {
  const { isAuthenticated, role, name } = useAuth();

  const getDashboardLink = () => {
    switch (role) {
      case 'general_user':
        return '/user/dashboard';
      case 'doctor':
        return '/doctor/dashboard';
      case 'hospital_admin':
        return '/admin/dashboard';
      default:
        return '/login';
    }
  };

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 4, md: 8 } }}>
      {/* Header */}
      <Box sx={{ mb: { xs: 4, md: 6 }, maxWidth: 760, mx: 'auto', textAlign: 'center' }}>
        <Typography variant="h3" gutterBottom sx={{ fontWeight: 700, color: 'primary.main' }}>
          Medical Certificate Portal
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mx: 'auto', maxWidth: 640 }}>
          Secure, multi-role platform for managing medical certificates
        </Typography>
      </Box>

      {/* Verify + Login Cards (Centered as a group) */}
      <Grid
        container
        spacing={4}
        sx={{ mt: 2 }}
        justifyContent="center"
      >
        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ textAlign: 'left', display: 'grid', gap: 2, minHeight: 240 }}>
              <Typography variant="h5" gutterBottom sx={{ fontWeight: 700 }}>
                Verify Certificate
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Check the validity of any medical certificate issued through our system
              </Typography>
              <Button
                variant="contained"
                color="primary"
                component={Link}
                to="/verify"
                size="large"
                sx={{ justifySelf: 'start' }}
              >
                Verify Now
              </Button>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ textAlign: 'left', display: 'grid', gap: 2, minHeight: 240 }}>
              <Typography variant="h5" gutterBottom sx={{ fontWeight: 700 }}>
                {isAuthenticated ? 'Go to Dashboard' : 'Login to Portal'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {isAuthenticated
                  ? `Continue as ${name} (${role})`
                  : 'Access your personalized portal based on your role'
                }
              </Typography>
              <Button
                variant="contained"
                color="primary"
                component={Link}
                to={isAuthenticated ? getDashboardLink() : '/login'}
                size="large"
                sx={{ justifySelf: 'start' }}
              >
                {isAuthenticated ? 'Dashboard' : 'Login'}
              </Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Available Roles */}
      <Box sx={{ mt: 6 }}>
        <Typography variant="h4" gutterBottom align="center" sx={{ fontWeight: 700 }}>
          Available Roles
        </Typography>

        <Grid
          container
          spacing={3}
          sx={{ mt: 2 }}
          justifyContent="center"
        >
          <Grid item xs={12} md={4}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="h6" color="primary" gutterBottom sx={{ fontWeight: 700 }}>
                  General User
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  • Request medical certificates<br />
                  • View certificate history<br />
                  • Download issued certificates
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={4}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="h6" color="primary" gutterBottom sx={{ fontWeight: 700 }}>
                  Doctor
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  • Issue medical certificates<br />
                  • Review patient requests<br />
                  • View issuance history
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={4}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="h6" color="primary" gutterBottom sx={{ fontWeight: 700 }}>
                  Hospital Admin
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  • Manage users and doctors<br />
                  • View system analytics<br />
                  • Audit certificate logs
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Box>
    </Container>
  );
};

export default LandingPage;
