import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Box,
  Typography,
  Divider,
  Chip
} from '@mui/material';
import {
  AccessTime as AccessTimeIcon,
  Description as DescriptionIcon,
  Person as PersonIcon
} from '@mui/icons-material';
import { apiFetch } from '../../../utils/api';

const RequestForm = ({ open, onClose, patient, document }) => {
  const [formData, setFormData] = useState({
    accessDuration: '1_week',
    reason: '',
    urgency: 'routine'
  });
  const [submitted, setSubmitted] = useState(false);

  const handleChange = (field) => (event) => {
    setFormData(prev => ({
      ...prev,
      [field]: event.target.value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      await apiFetch(`/api/doctor/documents/${document?._id}/request`, {
        method: 'POST',
        body: JSON.stringify({ reason: formData.reason, urgency: formData.urgency, accessDuration: formData.accessDuration })
      });

      setSubmitted(true);
      setTimeout(() => {
        onClose(true); // pass true to indicate a refresh is needed in parent
        setSubmitted(false);
        setFormData({
          accessDuration: '1_week',
          reason: '',
          urgency: 'routine'
        });

        alert(`✅ Access request submitted!\nThe patient will need to approve your request.`);
      }, 1500);
    } catch (error) {
      console.error(error);
      alert(`Failed to submit request: ${error.message}`);
    }
  };

  const durationOptions = [
    { value: '1_hour', label: '1 Hour', description: 'For immediate consultation' },
    { value: '1_day', label: '1 Day', description: 'For daily review' },
    { value: '1_week', label: '1 Week', description: 'For treatment planning' },
    { value: '1_month', label: '1 Month', description: 'For ongoing care' },
    { value: 'permanent', label: 'Permanent', description: 'For primary care physician' }
  ];

  const urgencyOptions = [
    { value: 'routine', label: 'Routine', color: 'info' },
    { value: 'urgent', label: 'Urgent', color: 'warning' },
    { value: 'emergency', label: 'Emergency', color: 'error' }
  ];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Request Document Access
      </DialogTitle>

      <form onSubmit={handleSubmit}>
        <DialogContent>
          {submitted ? (
            <Alert severity="success" sx={{ mb: 2 }}>
              Request submitted successfully! Waiting for patient approval.
            </Alert>
          ) : (
            <>
              {/* Patient & Document Info */}
              <Box sx={{ mb: 3, p: 2, backgroundColor: '#f5f5f5', borderRadius: 2 }}>
                <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <PersonIcon fontSize="small" /> Request Details
                </Typography>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2" color="text.secondary">Patient:</Typography>
                  <Typography variant="body2" fontWeight="medium">{patient?.name}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Document:</Typography>
                  <Typography variant="body2" fontWeight="medium">{document?.name}</Typography>
                </Box>
              </Box>

              <Divider sx={{ my: 2 }} />

              {/* Access Duration */}
              <FormControl fullWidth sx={{ mb: 3 }}>
                <InputLabel>Access Duration</InputLabel>
                <Select
                  value={formData.accessDuration}
                  label="Access Duration"
                  onChange={handleChange('accessDuration')}
                  required
                >
                  {durationOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      <Box>
                        <Typography>{option.label}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {option.description}
                        </Typography>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* Urgency Level */}
              <FormControl fullWidth sx={{ mb: 3 }}>
                <InputLabel>Urgency Level</InputLabel>
                <Select
                  value={formData.urgency}
                  label="Urgency Level"
                  onChange={handleChange('urgency')}
                  required
                >
                  {urgencyOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      <Chip
                        label={option.label}
                        size="small"
                        color={option.color}
                        sx={{ mr: 1 }}
                      />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* Reason */}
              <TextField
                fullWidth
                multiline
                rows={4}
                label="Reason for Access"
                placeholder="Please explain why you need access to this document..."
                value={formData.reason}
                onChange={handleChange('reason')}
                sx={{ mb: 2 }}
              />

              {/* Security Notice */}
              <Alert severity="info" icon={<AccessTimeIcon />}>
                <Typography variant="caption">
                  <strong>Note:</strong> Access requests require patient approval.
                  The patient will be notified and can approve or deny your request.
                </Typography>
              </Alert>
            </>
          )}
        </DialogContent>

        <DialogActions sx={{ p: 3, pt: 0 }}>
          <Button onClick={onClose} disabled={submitted}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={submitted}
          >
            {submitted ? 'Submitting...' : 'Submit Request'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default RequestForm;