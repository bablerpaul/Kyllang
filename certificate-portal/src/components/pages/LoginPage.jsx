import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Box,
  Button,
  TextField,
  Card,
  CardContent,
  Typography,
  Alert,
  Grid
} from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';

const LoginPage = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const result = await login(username, password);

    if (result.success) {
      // Redirect based on role
      switch (result.role) {
        case 'general_user':
          navigate('/user/dashboard');
          break;
        case 'doctor':
          navigate('/doctor/dashboard');
          break;
        case 'hospital_admin':
          navigate('/admin/dashboard');
          break;
        default:
          navigate('/');
      }
    } else {
      setError(result.message || 'Login failed');
    }
  };


  return (
    <Box sx={{ maxWidth: 520, mx: 'auto', mt: { xs: 4, md: 8 } }}>
      <Card>
        <CardContent sx={{ p: { xs: 3, md: 4 } }}>
          <Typography variant="h4" component="h1" gutterBottom align="center" sx={{ fontWeight: 700 }}>
            Login to Portal
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit} sx={{ mt: 3, display: 'grid', gap: 2 }}>
            <TextField
              fullWidth
              label="Email"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />

            <TextField
              fullWidth
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
            >
              Login
            </Button>
          </Box>


          <Box sx={{ mt: 3, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }}>
                ← Back to Home
              </Link>
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};

export default LoginPage;