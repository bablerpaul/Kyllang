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
    <Container maxWidth="lg">
      {/* Header */}
      <Box sx={{ my: 4, textAlign: 'center' }}>
        <Typography variant="h2" component="h1" gutterBottom>
          Kyllang Medical Certificate Portal
        </Typography>
        <Typography variant="h5" color="text.secondary">
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
        <Grid item xs={12} md={5}>
          <Card elevation={3}>
            <CardContent sx={{ textAlign: 'center', py: 4 }}>
              <Typography variant="h5" gutterBottom>
                Verify Certificate
              </Typography>
              <Typography variant="body1" paragraph>
                Check the validity of any medical certificate issued through our system
              </Typography>
              <Button
                variant="contained"
                color="primary"
                component={Link}
                to="/verify"
                size="large"
              >
                Verify Now
              </Button>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={5}>
          <Card elevation={3}>
            <CardContent sx={{ textAlign: 'center', py: 4 }}>
              <Typography variant="h5" gutterBottom>
                {isAuthenticated ? 'Go to Dashboard' : 'Login to Portal'}
              </Typography>
              <Typography variant="body1" paragraph>
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
              >
                {isAuthenticated ? 'Dashboard' : 'Login'}
              </Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Available Roles */}
      <Box sx={{ mt: 6 }}>
        <Typography variant="h4" gutterBottom align="center">
          Available Roles
        </Typography>

        <Grid
          container
          spacing={3}
          sx={{ mt: 2 }}
          justifyContent="center"
        >
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography variant="h6" color="primary" gutterBottom>
                  General User
                </Typography>
                <Typography>
                  • Request medical certificates<br />
                  • View certificate history<br />
                  • Download issued certificates
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography variant="h6" color="primary" gutterBottom>
                  Doctor
                </Typography>
                <Typography>
                  • Issue medical certificates<br />
                  • Review patient requests<br />
                  • View issuance history
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography variant="h6" color="primary" gutterBottom>
                  Hospital Admin
                </Typography>
                <Typography>
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
