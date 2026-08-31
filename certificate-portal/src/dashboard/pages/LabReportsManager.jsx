import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Grid,
  Tooltip,
  Skeleton,
  Alert,
} from '@mui/material';
import ScienceIcon from '@mui/icons-material/Science';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import RefreshIcon from '@mui/icons-material/Refresh';
import { apiFetch } from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';

export default function LabReportsManager() {
  const { role, name } = useAuth();
  const [openDialog, setOpenDialog] = useState(false);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [newReport, setNewReport] = useState({
    patientId: '',
    testCategory: 'Blood Test',
    testName: '',
    resultsSummary: ''
  });

  const categories = ['Blood Test', 'Urine Test', 'MRI', 'CT Scan', 'ECG', 'X-ray', 'Ultrasound', 'General Pathology'];

  const isPatient = role === 'general_user';
  const isAdminOrDoctor = role === 'hospital_admin' || role === 'doctor';

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/emr/lab-reports');
      const data = res?.data || res || [];
      setReports(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch lab reports:', err);
      setError(err.message || 'Failed to load lab reports');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await apiFetch('/api/emr/lab-reports', {
        method: 'POST',
        body: JSON.stringify(newReport),
      });
      setOpenDialog(false);
      setNewReport({ patientId: '', testCategory: 'Blood Test', testName: '', resultsSummary: '' });
      fetchReports();
    } catch (err) {
      console.error('Failed to upload report:', err);
      setError(err.message || 'Failed to upload report');
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleDateString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#0f172a' }}>
            Lab & Diagnostic Reports
          </Typography>
          <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
            {isPatient 
              ? 'Your personal diagnostic imaging and laboratory test reports'
              : 'Diagnostic imaging (MRI, CT Scan, X-ray, Ultrasound) and laboratory tests'
            }
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={fetchReports}
            disabled={loading}
            sx={{ textTransform: 'none', fontWeight: 600, borderRadius: '8px' }}
          >
            Refresh
          </Button>
          {!isPatient && (
            <Button
              variant="contained"
              startIcon={<CloudUploadIcon />}
              onClick={() => setOpenDialog(true)}
              sx={{ bgcolor: '#059669', textTransform: 'none', fontWeight: 600, borderRadius: '8px' }}
            >
              Upload Report
            </Button>
          )}
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: '12px' }}>
        <Table>
          <TableHead sx={{ bgcolor: '#f8fafc' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
              {!isPatient && <TableCell sx={{ fontWeight: 700 }}>Patient ID</TableCell>}
              <TableCell sx={{ fontWeight: 700 }}>Category</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Test Name</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Ordering Doctor</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>IPFS CID</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Flag Result</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: isPatient ? 6 : 7 }).map((_, j) => (
                    <TableCell key={j}><Skeleton variant="text" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : reports.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isPatient ? 6 : 7} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                  <ScienceIcon sx={{ fontSize: 48, mb: 1, opacity: 0.3 }} />
                  <Typography variant="body1">No lab reports found</Typography>
                </TableCell>
              </TableRow>
            ) : (
              reports.map((report) => (
                <TableRow key={report._id} hover>
                  <TableCell sx={{ fontWeight: 600 }}>{formatDate(report.createdAt)}</TableCell>
                  {!isPatient && (
                    <TableCell sx={{ fontWeight: 600, color: '#059669' }}>
                      {report.patient || '—'}
                    </TableCell>
                  )}
                  <TableCell><Chip label={report.testCategory || 'General'} size="small" color="success" variant="outlined" /></TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{report.testName}</TableCell>
                  <TableCell>{report.orderedBy?.name || '—'}</TableCell>
                  <TableCell>
                    {report.ipfsCid ? (
                      <Tooltip title={`IPFS CID: ${report.ipfsCid}`}>
                        <Chip label={`${report.ipfsCid.substring(0, 12)}...`} size="small" sx={{ fontFamily: 'monospace', bgcolor: '#f1f5f9' }} />
                      </Tooltip>
                    ) : 'Pending'}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={(report.flag || 'normal').toUpperCase()}
                      size="small"
                      color={report.flag === 'high' || report.flag === 'abnormal' ? 'error' : 'success'}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {!isPatient && (
        <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
          <form onSubmit={handleCreate}>
            <DialogTitle sx={{ fontWeight: 700 }}>Upload Diagnostic Scan / Lab PDF</DialogTitle>
            <DialogContent dividers>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <TextField 
                    fullWidth 
                    label="Patient ID" 
                    value={newReport.patientId} 
                    onChange={(e) => setNewReport({ ...newReport, patientId: e.target.value })} 
                    required
                    helperText="MongoDB ObjectId of the patient"
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField select fullWidth label="Test Category" value={newReport.testCategory} onChange={(e) => setNewReport({ ...newReport, testCategory: e.target.value })}>
                    {categories.map((cat) => (
                      <MenuItem key={cat} value={cat}>{cat}</MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={6}>
                  <TextField fullWidth label="Test Name" value={newReport.testName} onChange={(e) => setNewReport({ ...newReport, testName: e.target.value })} required />
                </Grid>
                <Grid item xs={12}>
                  <Button variant="outlined" component="label" fullWidth startIcon={<PictureAsPdfIcon />} sx={{ py: 1.5 }}>
                    Attach PDF Report or Scan DICOM/Image
                    <input type="file" hidden accept="application/pdf,image/*" />
                  </Button>
                </Grid>
                <Grid item xs={12}>
                  <TextField fullWidth label="Overall Clinical Summary" multiline rows={2} value={newReport.resultsSummary} onChange={(e) => setNewReport({ ...newReport, resultsSummary: e.target.value })} required />
                </Grid>
              </Grid>
            </DialogContent>
            <DialogActions sx={{ p: 2 }}>
              <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
              <Button type="submit" variant="contained" startIcon={<CloudUploadIcon />} sx={{ bgcolor: '#059669' }}>
                Upload to IPFS Node
              </Button>
            </DialogActions>
          </form>
        </Dialog>
      )}
    </Box>
  );
}
