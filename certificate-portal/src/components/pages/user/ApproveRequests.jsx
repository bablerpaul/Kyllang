import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Chip,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  Person,
  MedicalServices,
  CheckCircle,
  Cancel,
  AccessTime,
  Visibility,
  History
} from '@mui/icons-material';
import forge from 'node-forge';
import { apiFetch } from '../../../utils/api';

const ApproveRequests = () => {
  const [requests, setRequests] = useState([]);
  const [approvedRequests, setApprovedRequests] = useState([]);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  const fetchDocuments = async () => {
    try {
      const docs = await apiFetch('/api/patient/documents');

      let pending = [];
      let approved = [];

      docs.forEach(doc => {
        // Find pending
        if (doc.accessRequests && doc.accessRequests.length > 0) {
          doc.accessRequests.forEach(req => {
            pending.push({
              id: req._id,
              docId: doc._id,
              doctorId: req.doctor._id,
              doctorName: req.doctor.name,
              doctorEmail: req.doctor.email,
              doctorPublicKey: req.doctor.publicKey,
              doctorSpecialty: 'Doctor', // Schema doesn't have specialty yet
              patientEncryptedKey: doc.patientEncryptedKey,
              patientName: 'Me',
              requestedFor: doc.title,
              certificateId: doc._id,
              status: 'pending',
              requestedAt: req.requestedAt,
              purpose: 'Document Access Review',
              urgency: 'routine'
            });
          });
        }

        // Find approved history
        if (doc.accessList && doc.accessList.length > 0) {
          doc.accessList.forEach(access => {
            approved.push({
              id: access._id,
              docId: doc._id,
              doctorId: access.doctor?._id || 'UNKNOWN',
              doctorName: access.doctor?.name || 'Unknown',
              requestedFor: doc.title,
              approvedAt: access.expiresAt,
            });
          });
        }
      });

      setRequests(pending);
      setApprovedRequests(approved);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const handleApprove = async (requestId) => {
    const request = requests.find(r => r.id === requestId);
    if (!request) return;

    try {
      const privateKeyStr = window.prompt("To authorize this request securely, please paste your RSA Private Key:");
      if (!privateKeyStr) return;

      const privateKey = forge.pki.privateKeyFromPem(privateKeyStr);
      const decodedPatientEncryptedKey = forge.util.decode64(request.patientEncryptedKey);
      const aesKey = privateKey.decrypt(decodedPatientEncryptedKey, 'RSA-OAEP', {
        md: forge.md.sha256.create(),
        mgf1: {
          md: forge.md.sha256.create()
        }
      });

      const doctorPublicKey = forge.pki.publicKeyFromPem(request.doctorPublicKey);
      const doctorEncryptedKey = doctorPublicKey.encrypt(aesKey, 'RSA-OAEP', {
        md: forge.md.sha256.create(),
        mgf1: {
          md: forge.md.sha256.create()
        }
      });
      const encodedDoctorEncryptedKey = forge.util.encode64(doctorEncryptedKey);

      await apiFetch(`/api/patient/documents/${request.docId}/approve`, {
        method: 'POST',
        body: JSON.stringify({
          doctorId: request.doctorId,
          doctorEncryptedKey: encodedDoctorEncryptedKey
        })
      });

      alert(`✅ Access approved for Dr. ${request.doctorName}`);
      fetchDocuments();
    } catch (err) {
      console.error(err);
      alert('Failed to approve request. Please ensure you entered the correct private key.');
    }
  };

  const handleDeny = async (requestId) => {
    const request = requests.find(r => r.id === requestId);
    if (!request) return;

    // In a full implementation, we would send a DELETE/Deny request to the backend.
    // For now we just remove from local view.
    setRequests(prev => prev.filter(r => r.id !== requestId));
    alert(`❌ Access denied for Dr. ${request.doctorName}`);
  };

  const handleViewDetails = (request) => {
    setSelectedRequest(request);
    setDetailDialogOpen(true);
  };

  const getUrgencyColor = (urgency) => {
    switch (urgency) {
      case 'high': return 'error';
      case 'medium': return 'warning';
      case 'routine': return 'info';
      default: return 'default';
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleApproveAll = async () => {
    if (requests.length === 0) return;

    try {
      const privateKeyStr = window.prompt(`To approve all ${requests.length} requests, please paste your RSA Private Key:`);
      if (!privateKeyStr) return;

      const privateKey = forge.pki.privateKeyFromPem(privateKeyStr);

      for (const request of requests) {
        const decodedPatientEncryptedKey = forge.util.decode64(request.patientEncryptedKey);
        const aesKey = privateKey.decrypt(decodedPatientEncryptedKey, 'RSA-OAEP', {
          md: forge.md.sha256.create(),
          mgf1: { md: forge.md.sha256.create() }
        });

        const doctorPublicKey = forge.pki.publicKeyFromPem(request.doctorPublicKey);
        const doctorEncryptedKey = doctorPublicKey.encrypt(aesKey, 'RSA-OAEP', {
          md: forge.md.sha256.create(),
          mgf1: { md: forge.md.sha256.create() }
        });
        const encodedDoctorEncryptedKey = forge.util.encode64(doctorEncryptedKey);

        await apiFetch(`/api/patient/documents/${request.docId}/approve`, {
          method: 'POST',
          body: JSON.stringify({
            doctorId: request.doctorId,
            doctorEncryptedKey: encodedDoctorEncryptedKey
          })
        });
      }

      alert(`✅ Approved all ${requests.length} pending requests!`);
      fetchDocuments();
    } catch (err) {
      console.error(err);
      alert('Failed to approve requests. Please ensure you entered the correct private key.');
    }
  };

  return (
    <Box>
      {/* Pending Requests */}
      <Card elevation={3} sx={{ mb: 4 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="h5" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <AccessTime /> Pending Access Requests
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Chip
                label={`${requests.length} pending`}
                color="warning"
                variant="outlined"
              />
              {requests.length > 0 && (
                <Button
                  variant="contained"
                  color="success"
                  size="small"
                  onClick={handleApproveAll}
                >
                  Approve All
                </Button>
              )}
            </Box>
          </Box>

          {requests.length === 0 ? (
            <Alert severity="info">
              No pending access requests. Doctors will appear here when they request access to your certificates.
            </Alert>
          ) : (
            <List>
              {requests.map((request) => (
                <ListItem
                  key={request.id}
                  sx={{
                    mb: 2,
                    backgroundColor: '#f9f9f9',
                    borderRadius: 2,
                    borderLeft: `4px solid ${request.urgency === 'high' ? '#ff4444' :
                      request.urgency === 'medium' ? '#ffaa00' : '#2196f3'
                      }`
                  }}
                  secondaryAction={
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Tooltip title="View Details">
                        <IconButton onClick={() => handleViewDetails(request)}>
                          <Visibility />
                        </IconButton>
                      </Tooltip>
                      <Button
                        variant="contained"
                        color="success"
                        size="small"
                        startIcon={<CheckCircle />}
                        onClick={() => handleApprove(request.id)}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="outlined"
                        color="error"
                        size="small"
                        startIcon={<Cancel />}
                        onClick={() => handleDeny(request.id)}
                      >
                        Deny
                      </Button>
                    </Box>
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
                          Dr. {request.doctorName}
                        </Typography>
                        <Chip
                          label={request.doctorSpecialty}
                          size="small"
                          variant="outlined"
                        />
                        <Chip
                          label={request.urgency}
                          size="small"
                          color={getUrgencyColor(request.urgency)}
                        />
                      </Box>
                    }
                    secondary={
                      <>
                        <Typography variant="body2" component="div">
                          <strong>Request:</strong> {request.requestedFor}
                        </Typography>
                        <Typography variant="body2" component="div">
                          <strong>Patient:</strong> {request.patientName}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Requested {formatDate(request.requestedAt)}
                        </Typography>
                      </>
                    }
                  />
                </ListItem>
              ))}
            </List>
          )}

          <Divider sx={{ my: 2 }} />

          {/* Statistics */}
          <Box sx={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h4" color="warning.main">
                {requests.length}
              </Typography>
              <Typography variant="caption">Pending</Typography>
            </Box>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h4" color="success.main">
                {approvedRequests.length}
              </Typography>
              <Typography variant="caption">Approved</Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Approved Requests History */}
      {approvedRequests.length > 0 && (
        <Card elevation={2}>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <History /> Approved Requests History
            </Typography>

            <List dense>
              {approvedRequests.slice(-5).reverse().map((request) => (
                <ListItem key={request.id} sx={{ py: 1 }}>
                  <ListItemAvatar>
                    <Avatar sx={{ bgcolor: 'success.light', width: 32, height: 32 }}>
                      <Person fontSize="small" />
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={`Dr. ${request.doctorName} - ${request.requestedFor}`}
                    secondary={
                      <Typography variant="caption">
                        Approved on {new Date(request.approvedAt || request.requestedAt).toLocaleDateString()}
                      </Typography>
                    }
                  />
                  <Chip
                    label="Approved"
                    size="small"
                    color="success"
                    variant="outlined"
                  />
                </ListItem>
              ))}
            </List>

            {approvedRequests.length > 5 && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 1 }}>
                Showing 5 most recent of {approvedRequests.length} approved requests
              </Typography>
            )}
          </CardContent>
        </Card>
      )}

      {/* Request Details Dialog */}
      <Dialog
        open={detailDialogOpen}
        onClose={() => setDetailDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        {selectedRequest && (
          <>
            <DialogTitle>
              Access Request Details
            </DialogTitle>
            <DialogContent>
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" color="text.secondary">
                  Doctor Information
                </Typography>
                <Typography variant="body1">
                  <strong>Name:</strong> Dr. {selectedRequest.doctorName}
                </Typography>
                <Typography variant="body1">
                  <strong>Specialty:</strong> {selectedRequest.doctorSpecialty}
                </Typography>
                <Typography variant="body1">
                  <strong>ID:</strong> {selectedRequest.doctorId}
                </Typography>
              </Box>

              <Divider sx={{ my: 2 }} />

              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" color="text.secondary">
                  Request Details
                </Typography>
                <Typography variant="body1">
                  <strong>Certificate Type:</strong> {selectedRequest.requestedFor}
                </Typography>
                <Typography variant="body1">
                  <strong>Certificate ID:</strong> {selectedRequest.certificateId}
                </Typography>
                <Typography variant="body1">
                  <strong>Patient Name:</strong> {selectedRequest.patientName}
                </Typography>
                <Typography variant="body1">
                  <strong>Purpose:</strong> {selectedRequest.purpose}
                </Typography>
                <Typography variant="body1">
                  <strong>Urgency:</strong>
                  <Chip
                    label={selectedRequest.urgency}
                    size="small"
                    color={getUrgencyColor(selectedRequest.urgency)}
                    sx={{ ml: 1 }}
                  />
                </Typography>
              </Box>

              <Divider sx={{ my: 2 }} />

              <Typography variant="caption" color="text.secondary">
                Requested on {formatDate(selectedRequest.requestedAt)}
              </Typography>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDetailDialogOpen(false)}>Close</Button>
              <Button
                variant="contained"
                color="success"
                onClick={() => {
                  handleApprove(selectedRequest.id);
                  setDetailDialogOpen(false);
                }}
              >
                Approve Access
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
};

export default ApproveRequests;