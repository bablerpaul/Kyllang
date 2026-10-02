import React, { useState, useEffect } from 'react';
import {
  Box, Card, CardContent, Typography, Button, List, ListItem, ListItemText,
  ListItemAvatar, Avatar, Chip, Alert, Dialog, DialogTitle, DialogContent, 
  DialogActions, CircularProgress
} from '@mui/material';
import {
  MedicalServices, CheckCircle, AccessTime
} from '@mui/icons-material';
import { apiFetch } from '../../../utils/api';

const MedicalCertificateRequests = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState(null);
  const [approving, setApproving] = useState(false);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/api/patient/doctor-certificate-requests');
      if (res.success && res.data) {
        setRequests(res.data);
      } else {
        setRequests([]);
      }
      setError('');
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to load certificate requests.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const handleApproveClick = (id) => {
    setSelectedRequestId(id);
    setConfirmDialogOpen(true);
  };

  const handleConfirmApprove = async () => {
    if (!selectedRequestId) return;
    try {
      setApproving(true);
      const res = await apiFetch(`/api/patient/doctor-certificate-requests/${selectedRequestId}/approve`, {
        method: 'POST'
      });
      if (res.success) {
        alert('Certificate request approved.');
        setConfirmDialogOpen(false);
        setSelectedRequestId(null);
        fetchRequests(); // refresh the list
      }
    } catch (err) {
      console.error(err);
      alert(err.message || 'Failed to approve request.');
    } finally {
      setApproving(false);
    }
  };

  const pendingRequests = requests.filter(r => r.status === 'pending');
  const pastRequests = requests.filter(r => r.status !== 'pending');

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;
  }

  return (
    <Box sx={{ p: { xs: 1, md: 3 } }}>
      <Typography variant="h4" gutterBottom>
        Medical Certificate Requests
      </Typography>
      
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <Card sx={{ mb: 4 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="h5" sx={{ display: 'flex', alignItems: 'center', gap: 1, fontWeight: 700 }}>
              <AccessTime /> Pending Requests
            </Typography>
            <Chip
              label={`${pendingRequests.length} pending`}
              color="warning"
              variant="outlined"
            />
          </Box>

          {pendingRequests.length === 0 ? (
            <Alert severity="info">
              No pending certificate requests.
            </Alert>
          ) : (
            <List>
              {pendingRequests.map((request) => (
                <ListItem
                  key={request._id}
                  sx={{
                    mb: 2,
                    backgroundColor: 'background.paper',
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: 'divider',
                  }}
                  secondaryAction={
                    <Button
                      variant="contained"
                      color="success"
                      size="small"
                      startIcon={<CheckCircle />}
                      onClick={() => handleApproveClick(request._id)}
                    >
                      Approve
                    </Button>
                  }
                >
                  <ListItemAvatar>
                    <Avatar sx={{ bgcolor: 'primary.main' }}>
                      <MedicalServices />
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Typography variant="subtitle1" component="span">
                          Dr. {request.doctor?.user?.name || 'Unknown'}
                        </Typography>
                        <Chip
                          label={request.doctor?.specialty || request.doctor?.department || 'Doctor'}
                          size="small"
                          variant="outlined"
                        />
                      </Box>
                    }
                    secondary={
                      <Box sx={{ mt: 1 }}>
                        <Typography variant="body2" component="div">
                          <strong>Type:</strong> {request.certificateType}
                        </Typography>
                        <Typography variant="body2" component="div">
                          <strong>Reason:</strong> {request.reason}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                          Requested on {new Date(request.createdAt).toLocaleDateString()}
                        </Typography>
                      </Box>
                    }
                  />
                </ListItem>
              ))}
            </List>
          )}
        </CardContent>
      </Card>

      {pastRequests.length > 0 && (
        <Card elevation={2}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Past Requests
            </Typography>
            <List dense>
              {pastRequests.map((request) => (
                <ListItem key={request._id} sx={{ py: 1 }}>
                  <ListItemAvatar>
                    <Avatar sx={{ bgcolor: request.status === 'approved' || request.status === 'consumed' ? 'success.light' : 'error.light', width: 32, height: 32 }}>
                      <MedicalServices fontSize="small" />
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={`Dr. ${request.doctor?.user?.name || 'Unknown'} - ${request.certificateType}`}
                    secondary={
                      <Typography variant="caption">
                        {request.status.charAt(0).toUpperCase() + request.status.slice(1)} on {new Date(request.approvedAt || request.updatedAt).toLocaleDateString()}
                      </Typography>
                    }
                  />
                  <Chip
                    label={request.status}
                    size="small"
                    color={request.status === 'approved' || request.status === 'consumed' ? 'success' : 'default'}
                    variant="outlined"
                  />
                </ListItem>
              ))}
            </List>
          </CardContent>
        </Card>
      )}

      {/* Confirmation Dialog */}
      <Dialog
        open={confirmDialogOpen}
        onClose={() => !approving && setConfirmDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Approve Certificate Request</DialogTitle>
        <DialogContent>
          <Typography variant="body1">
            By approving this request, you authorize the requesting Doctor to proceed with the medical certificate generation.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDialogOpen(false)} disabled={approving}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="success"
            onClick={handleConfirmApprove}
            disabled={approving}
          >
            {approving ? 'Approving...' : 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default MedicalCertificateRequests;
