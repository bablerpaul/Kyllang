import React, { useState } from 'react';
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
} from '@mui/material';
import ScienceIcon from '@mui/icons-material/Science';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';

export default function LabReportsManager() {
  const [openDialog, setOpenDialog] = useState(false);
  const [reports, setReports] = useState([
    { _id: 'LAB-701', patientName: 'John Doe', testCategory: 'MRI', testName: 'Brain MRI Scan', doctorName: 'Dr. Marcus Vance', flag: 'normal', ipfsCid: 'QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco', date: '2026-07-24' },
    { _id: 'LAB-702', patientName: 'Alice Smith', testCategory: 'Blood Test', testName: 'Complete Blood Count (CBC)', doctorName: 'Dr. Sarah Jenkins', flag: 'high', ipfsCid: 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG', date: '2026-07-25' },
    { _id: 'LAB-703', patientName: 'Robert Johnson', testCategory: 'CT Scan', testName: 'Abdominal CT Scan', doctorName: 'Dr. James Chen', flag: 'normal', ipfsCid: 'QmZtrjfH2N4pL9kVmHq8t1Xs3Z5n7W9x1B3v5C7d9E0f1', date: '2026-07-26' },
  ]);

  const [newReport, setNewReport] = useState({ patientName: 'John Doe', testCategory: 'MRI', testName: 'Lumbar Spine MRI', overallSummary: 'No acute disc herniation' });

  const categories = ['Blood Test', 'Urine Test', 'MRI', 'CT Scan', 'ECG', 'X-ray', 'Ultrasound', 'General Pathology'];

  const handleCreate = (e) => {
    e.preventDefault();
    const fakeCid = `Qm${Array.from({ length: 44 }, () => '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'[Math.floor(Math.random() * 58)]).join('')}`;
    setReports([{
      _id: `LAB-${700 + reports.length + 1}`,
      patientName: newReport.patientName,
      testCategory: newReport.testCategory,
      testName: newReport.testName,
      doctorName: 'Dr. Sarah Jenkins',
      flag: 'normal',
      ipfsCid: fakeCid,
      date: new Date().toISOString().split('T')[0]
    }, ...reports]);
    setOpenDialog(false);
  };

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#0f172a' }}>
            Lab & Diagnostic Reports
          </Typography>
          <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
            Diagnostic imaging (MRI, CT Scan, X-ray, Ultrasound) and laboratory tests with IPFS CID metadata
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<CloudUploadIcon />}
          onClick={() => setOpenDialog(true)}
          sx={{ bgcolor: '#059669', textTransform: 'none', fontWeight: 600, borderRadius: '8px' }}
        >
          Upload Diagnostic Report
        </Button>
      </Box>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: '12px' }}>
        <Table>
          <TableHead sx={{ bgcolor: '#f8fafc' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Report ID</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Patient</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Category</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Test Name</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Ordering Doctor</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>IPFS CID</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Flag Result</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {reports.map((report) => (
              <TableRow key={report._id} hover>
                <TableCell sx={{ fontWeight: 600, color: '#059669' }}>{report._id}</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>{report.patientName}</TableCell>
                <TableCell><Chip label={report.testCategory} size="small" color="success" variant="outlined" /></TableCell>
                <TableCell sx={{ fontWeight: 600 }}>{report.testName}</TableCell>
                <TableCell>{report.doctorName}</TableCell>
                <TableCell>
                  <Tooltip title={`IPFS CID: ${report.ipfsCid}`}>
                    <Chip label={`${report.ipfsCid.substring(0, 12)}...`} size="small" sx={{ fontFamily: 'monospace', bgcolor: '#f1f5f9' }} />
                  </Tooltip>
                </TableCell>
                <TableCell>
                  <Chip
                    label={report.flag.toUpperCase()}
                    size="small"
                    color={report.flag === 'high' ? 'error' : 'success'}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
        <form onSubmit={handleCreate}>
          <DialogTitle sx={{ fontWeight: 700 }}>Upload Diagnostic Scan / Lab PDF</DialogTitle>
          <DialogContent dividers>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField fullWidth label="Patient Name" value={newReport.patientName} onChange={(e) => setNewReport({ ...newReport, patientName: e.target.value })} />
              </Grid>
              <Grid item xs={6}>
                <TextField select fullWidth label="Test Category" value={newReport.testCategory} onChange={(e) => setNewReport({ ...newReport, testCategory: e.target.value })}>
                  {categories.map((cat) => (
                    <MenuItem key={cat} value={cat}>{cat}</MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={6}>
                <TextField fullWidth label="Test Name" value={newReport.testName} onChange={(e) => setNewReport({ ...newReport, testName: e.target.value })} />
              </Grid>
              <Grid item xs={12}>
                <Button variant="outlined" component="label" fullWidth startIcon={<PictureAsPdfIcon />} sx={{ py: 1.5 }}>
                  Attach PDF Report or Scan DICOM/Image
                  <input type="file" hidden accept="application/pdf,image/*" />
                </Button>
              </Grid>
              <Grid item xs={12}>
                <TextField fullWidth label="Overall Clinical Summary" multiline rows={2} value={newReport.overallSummary} onChange={(e) => setNewReport({ ...newReport, overallSummary: e.target.value })} />
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
    </Box>
  );
}
