import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  Divider,
  IconButton,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import ScienceIcon from '@mui/icons-material/Science';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DownloadIcon from '@mui/icons-material/Download';
import { apiFetch } from '../../utils/api';
import { jsPDF } from 'jspdf';
import { useAuth } from '../../contexts/AuthContext';
import {
  OTHER_TEST,
  DETAIL_KEYS,
  INVESTIGATION_CATEGORIES,
  typesFor,
  testsFor,
  templateFor,
  categoryOfReport,
  detailLabelFor,
  ATTACHMENT_ACCEPT,
  ATTACHMENT_TYPES_LABEL,
} from './labInvestigationCatalog';

const FLAGS = ['normal', 'high', 'low', 'critical'];
// Local calendar date (YYYY-MM-DD) — toISOString() would give the UTC date.
const todayISO = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
};

const emptyForm = () => ({
  patientId: '',
  category: '',
  type: '',
  test: '',
  customTestName: '',
  reportDate: todayISO(),
  rows: [],
  details: {},
  overallSummary: '',
  file: null,
});

const rowsFromTemplate = (tpl) =>
  (tpl?.parameters || []).map((prm) => ({ parameter: prm.parameter, unit: prm.unit, value: '', referenceRange: '', flag: 'normal', fixed: true }));

// Overall flag of a report from its result rows: CRITICAL > ABNORMAL (high/low) > NORMAL; '—' when there are no rows.
const overallFlag = (report) => {
  const flags = (report.results || []).map((r) => r.flag || 'normal');
  if (flags.length === 0) return null;
  if (flags.includes('critical')) return 'critical';
  if (flags.includes('high') || flags.includes('low')) return 'abnormal';
  return 'normal';
};
const FLAG_COLOR = { critical: 'error', abnormal: 'warning', normal: 'success', high: 'warning', low: 'warning' };

const personName = (ref) => ref?.user?.name || ref?.name || null;

export const generateManualLabReportPdf = (report) => {
  const doc = new jsPDF();
  let y = 20;
  const leftMargin = 20;
  const pageWidth = doc.internal.pageSize.getWidth();
  const textWidth = pageWidth - 2 * leftMargin;

  const addWrappedText = (text, x, yPos, options = {}) => {
    if (!text) return yPos;
    const lines = doc.splitTextToSize(String(text), options.maxWidth || textWidth);
    const lineHeight = options.lineHeight || 7;
    for (let i = 0; i < lines.length; i++) {
      if (yPos > 270) {
        doc.addPage();
        yPos = 20;
      }
      doc.text(lines[i], x, yPos);
      yPos += lineHeight;
    }
    return yPos;
  };

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  y = addWrappedText('Kyllang Health Platform', leftMargin, y);
  doc.setFontSize(14);
  y = addWrappedText('Lab & Diagnostic Report', leftMargin, y);
  y += 10;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');

  const pName = personName(report.patient) || report.patient?._id || 'N/A';
  y = addWrappedText(`Patient: ${pName}`, leftMargin, y);

  const dName = personName(report.orderedBy) ? `Dr. ${personName(report.orderedBy)}` : 'N/A';
  y = addWrappedText(`Doctor: ${dName}`, leftMargin, y);

  y = addWrappedText(`Investigation Category: ${categoryOfReport(report) || 'N/A'}`, leftMargin, y);
  y = addWrappedText(`Test Category: ${report.testCategory || 'N/A'}`, leftMargin, y);
  y = addWrappedText(`Test Name: ${report.testName || 'N/A'}`, leftMargin, y);

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

  const rDate = formatDate(report.reportDate || report.createdAt);
  y = addWrappedText(`Report Date: ${rDate}`, leftMargin, y);
  y += 10;

  if ((report.results || []).length > 0) {
    doc.setFont('helvetica', 'bold');
    y = addWrappedText('Results:', leftMargin, y);
    doc.setFont('helvetica', 'normal');
    report.results.forEach(r => {
      const val = r.value || 'N/A';
      const unit = r.unit || '';
      const ref = r.referenceRange ? ` (Ref: ${r.referenceRange})` : '';
      const flag = r.flag && r.flag !== 'normal' ? ` [${r.flag.toUpperCase()}]` : '';
      y = addWrappedText(`${r.parameter}: ${val} ${unit}${ref}${flag}`, leftMargin + 5, y);
    });
    y += 5;
  }

  const detailKeys = DETAIL_KEYS.filter((k) => report.reportDetails?.[k]);
  if (detailKeys.length > 0) {
    doc.setFont('helvetica', 'bold');
    y = addWrappedText('Report Details:', leftMargin, y);
    doc.setFont('helvetica', 'normal');
    detailKeys.forEach(k => {
      y = addWrappedText(`${detailLabelFor(report, k)}:`, leftMargin + 5, y);
      y = addWrappedText(report.reportDetails[k], leftMargin + 10, y);
    });
    y += 5;
  }

  if (report.interpretation) {
    doc.setFont('helvetica', 'bold');
    y = addWrappedText('Interpretation:', leftMargin, y);
    doc.setFont('helvetica', 'normal');
    y = addWrappedText(report.interpretation, leftMargin + 5, y);
    y += 5;
  }

  if (report.overallSummary || report.resultsSummary) {
    doc.setFont('helvetica', 'bold');
    y = addWrappedText('Overall Clinical Summary:', leftMargin, y);
    doc.setFont('helvetica', 'normal');
    y = addWrappedText(report.overallSummary || report.resultsSummary, leftMargin + 5, y);
    y += 5;
  }

  if (report.reportHash) {
    y += 5;
    doc.setFontSize(9);
    doc.setFont('courier', 'normal');
    y = addWrappedText(`Report hash: ${report.reportHash}`, leftMargin, y);
  }

  return doc;
};

export default function LabReportsManager() {
  const { role, name } = useAuth();
  const [openDialog, setOpenDialog] = useState(false);
  const [viewReport, setViewReport] = useState(null);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadError, setDownloadError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [creationMode, setCreationMode] = useState('manual');
  const [form, setForm] = useState(emptyForm);

  const isPatient = role === 'general_user';
  // Mirrors the backend: POST /api/lab-reports is authorized for doctor / hospital_admin only.
  const canCreate = role === 'doctor' || role === 'hospital_admin';

  const template = useMemo(
    () => (form.category && form.type && form.test ? templateFor(form.category, form.type, form.test === OTHER_TEST ? null : form.test) : null),
    [form.category, form.type, form.test]
  );

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/lab-reports');
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

  const handleDownload = async () => {
    if (!viewReport || !viewReport.secureFile) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      const res = await fetch(`/api/secure-storage/download/${viewReport.secureFile}`, { credentials: 'include' });
      if (!res.ok) {
        if (res.status === 401) throw new Error('Authentication required.');
        if (res.status === 403) throw new Error('You do not have permission to download this file.');
        if (res.status === 404) throw new Error('The secure file could not be found.');
        throw new Error('Download failed with status: ' + res.status);
      }
      const blob = await res.blob();
      
      let filename = `lab-report-${viewReport.testName || 'report'}.pdf`;
      const disposition = res.headers.get('content-disposition');
      if (disposition && disposition.indexOf('filename=') !== -1) {
          const matches = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(disposition);
          if (matches != null && matches[1]) {
              filename = matches[1].replace(/['"]/g, '');
          }
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Download error:', err);
      setDownloadError(err.message || 'Failed to download report.');
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadManualPdf = () => {
    if (!viewReport || viewReport.secureFile) return;
    setDownloadingPdf(true);
    setDownloadError(null);
    try {
      const doc = generateManualLabReportPdf(viewReport);
      const safeDate = (viewReport.reportDate || viewReport.createdAt || '').split('T')[0] || 'UnknownDate';
      const safeCat = (viewReport.testCategory || 'Report').replace(/\s+/g, '_');
      const filename = `Lab_Report_${safeCat}_${safeDate}.pdf`;
      doc.save(filename);
    } catch (err) {
      console.error('PDF generation error:', err);
      setDownloadError(err.message || 'Failed to generate PDF.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const closeViewReport = () => {
    setViewReport(null);
    setDownloadError(null);
  };

  const visibleReports = useMemo(
    () => (filter === 'all' ? reports : reports.filter((r) => categoryOfReport(r) === filter)),
    [reports, filter]
  );

  // ── Form handlers ────────────────────────────────────────────────────────────────────────────────────────────────
  const setCategory = (category) => setForm((f) => ({ ...f, category, type: '', test: '', customTestName: '', rows: [], details: {} }));
  const setType = (type) => setForm((f) => ({ ...f, type, test: '', customTestName: '', rows: [], details: {} }));
  const setTest = (test) =>
    setForm((f) => ({
      ...f,
      test,
      customTestName: '',
      rows: rowsFromTemplate(templateFor(f.category, f.type, test === OTHER_TEST ? null : test)),
      details: {},
    }));
  const updateRow = (i, patch) => setForm((f) => ({ ...f, rows: f.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
  const addRow = () => setForm((f) => ({ ...f, rows: [...f.rows, { parameter: '', unit: '', value: '', referenceRange: '', flag: 'normal', fixed: false }] }));
  const removeRow = (i) => setForm((f) => ({ ...f, rows: f.rows.filter((_, j) => j !== i) }));
  const updateDetail = (key, value) => setForm((f) => ({ ...f, details: { ...f.details, [key]: value } }));

  const closeCreate = () => {
    setOpenDialog(false);
    setFormError(null);
    setCreationMode('manual');
    setForm(emptyForm());
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormError(null);

    const testName = form.test === OTHER_TEST ? form.customTestName.trim() : form.test;
    if (!testName) {
      setFormError('Please select or enter the specific test.');
      return;
    }
    // Only rows with a result value are sent; blank optional rows are simply left out.
    const filled = form.rows.filter((r) => String(r.value).trim());
    if (filled.some((r) => !String(r.parameter).trim())) {
      setFormError('Every result row with a value needs a parameter name.');
      return;
    }
    const results = filled.map((r) => ({
      parameter: r.parameter.trim(),
      value: String(r.value).trim(),
      ...(r.unit?.trim() ? { unit: r.unit.trim() } : {}),
      ...(r.referenceRange?.trim() ? { referenceRange: r.referenceRange.trim() } : {}),
      flag: r.flag || 'normal',
    }));
    const shownKeys = (template?.details || []).map((x) => x.key);
    const reportDetails = Object.fromEntries(
      shownKeys.filter((k) => form.details[k]?.trim()).map((k) => [k, form.details[k].trim()])
    );
    if (results.length === 0 && Object.keys(reportDetails).length === 0 && !form.overallSummary.trim()) {
      setFormError('Enter at least one result, finding or the overall clinical summary.');
      return;
    }

    setSaving(true);
    try {
      if (creationMode === 'upload') {
        if (!form.file) {
          setFormError('Please select a file to upload.');
          setSaving(false);
          return;
        }
        
        const formData = new FormData();
        formData.append('patientId', form.patientId.trim());
        formData.append('testCategory', form.type);
        formData.append('testName', testName);
        if (form.reportDate) formData.append('reportDate', form.reportDate);
        formData.append('file', form.file);

        await apiFetch('/api/lab-reports/upload', {
          method: 'POST',
          body: formData,
        });
      } else {
        await apiFetch('/api/lab-reports', {
          method: 'POST',
          body: JSON.stringify({
            patientId: form.patientId.trim(),
            investigationCategory: form.category,
            testCategory: form.type,
            testName,
            reportDate: form.reportDate || undefined,
            results,
            reportDetails,
            ...(form.overallSummary.trim() ? { overallSummary: form.overallSummary.trim() } : {}),
          }),
        });
      }
      setOpenDialog(false);
      setForm(emptyForm());
      fetchReports();
    } catch (err) {
      console.error('Failed to save report:', err);
      setFormError(err.message || 'Failed to save report');
    } finally {
      setSaving(false);
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

  const columnCount = isPatient ? 7 : 8;

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#0f172a' }}>
            Lab & Diagnostic Reports
          </Typography>
          <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
            {isPatient
              ? 'Your personal laboratory results and diagnostic investigation reports'
              : 'Laboratory investigations (hematology, biochemistry, pathology, …) and diagnostic studies (ECG, imaging)'}
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
          {canCreate && (
            <Button
              variant="contained"
              startIcon={<CloudUploadIcon />}
              onClick={() => setOpenDialog(true)}
              sx={{ bgcolor: '#059669', textTransform: 'none', fontWeight: 600, borderRadius: '8px' }}
            >
              New Report
            </Button>
          )}
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <ToggleButtonGroup
        size="small"
        exclusive
        value={filter}
        onChange={(_, v) => v && setFilter(v)}
        sx={{ mb: 2 }}
      >
        <ToggleButton value="all" sx={{ textTransform: 'none', px: 2 }}>All</ToggleButton>
        {INVESTIGATION_CATEGORIES.map((c) => (
          <ToggleButton key={c} value={c} sx={{ textTransform: 'none', px: 2 }}>{c}</ToggleButton>
        ))}
      </ToggleButtonGroup>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: '12px' }}>
        <Table>
          <TableHead sx={{ bgcolor: '#f8fafc' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
              {!isPatient && <TableCell sx={{ fontWeight: 700 }}>Patient</TableCell>}
              <TableCell sx={{ fontWeight: 700 }}>Category</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Investigation Type</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Test Name</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Ordering Doctor</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Result Flag</TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">Details</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: columnCount }).map((_, j) => (
                    <TableCell key={j}><Skeleton variant="text" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : visibleReports.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columnCount} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                  <ScienceIcon sx={{ fontSize: 48, mb: 1, opacity: 0.3 }} />
                  <Typography variant="body1">No lab or diagnostic reports found</Typography>
                </TableCell>
              </TableRow>
            ) : (
              visibleReports.map((report) => {
                const cat = categoryOfReport(report);
                const flag = overallFlag(report);
                return (
                  <TableRow key={report._id} hover sx={{ cursor: 'pointer' }} onClick={() => setViewReport(report)}>
                    <TableCell sx={{ fontWeight: 600 }}>{formatDate(report.reportDate || report.createdAt)}</TableCell>
                    {!isPatient && (
                      <TableCell sx={{ fontWeight: 600, color: '#059669' }}>
                        {personName(report.patient) || report.patient?._id || report.patient || '—'}
                      </TableCell>
                    )}
                    <TableCell>
                      {cat ? (
                        <Chip label={cat} size="small" color={cat === 'Laboratory' ? 'success' : 'info'} variant="outlined" />
                      ) : '—'}
                    </TableCell>
                    <TableCell>{report.testCategory || '—'}</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{report.testName}</TableCell>
                    <TableCell>{personName(report.orderedBy) ? `Dr. ${personName(report.orderedBy)}` : '—'}</TableCell>
                    <TableCell>
                      {flag ? <Chip label={flag.toUpperCase()} size="small" color={FLAG_COLOR[flag]} /> : '—'}
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="View report">
                        <IconButton size="small" onClick={(e) => { e.stopPropagation(); setViewReport(report); }}>
                          <VisibilityIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* ── View report ──────────────────────────────────────────────────────────────────────────────────────── */}
      <Dialog open={!!viewReport} onClose={closeViewReport} maxWidth="md" fullWidth>
        {viewReport && (
          <>
            <DialogTitle sx={{ fontWeight: 700 }}>
              {viewReport.testName}
              <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
                {categoryOfReport(viewReport) && <Chip size="small" label={categoryOfReport(viewReport)} variant="outlined" />}
                {viewReport.testCategory && <Chip size="small" label={viewReport.testCategory} />}
              </Box>
            </DialogTitle>
            <DialogContent dividers>
              {downloadError && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setDownloadError(null)}>
                  {downloadError}
                </Alert>
              )}
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <Typography variant="caption" color="text.secondary">Date</Typography>
                  <Typography variant="body2">{formatDate(viewReport.reportDate || viewReport.createdAt)}</Typography>
                </Grid>
                {!isPatient && (
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <Typography variant="caption" color="text.secondary">Patient</Typography>
                    <Typography variant="body2">{personName(viewReport.patient) || viewReport.patient?._id || '—'}</Typography>
                  </Grid>
                )}
                <Grid size={{ xs: 12, sm: 4 }}>
                  <Typography variant="caption" color="text.secondary">Ordering Doctor</Typography>
                  <Typography variant="body2">{personName(viewReport.orderedBy) ? `Dr. ${personName(viewReport.orderedBy)}` : '—'}</Typography>
                </Grid>
              </Grid>

              {(viewReport.results || []).length > 0 && (
                <>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>Results</Typography>
                  <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 700 }}>Parameter</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Result</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Unit</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Reference Range</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Flag</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {viewReport.results.map((r, i) => (
                          <TableRow key={r._id || i}>
                            <TableCell>{r.parameter}</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>{r.value}</TableCell>
                            <TableCell>{r.unit || '—'}</TableCell>
                            <TableCell>{r.referenceRange || '—'}</TableCell>
                            <TableCell>
                              <Chip label={(r.flag || 'normal').toUpperCase()} size="small" color={FLAG_COLOR[r.flag] || 'success'} variant="outlined" />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </>
              )}

              {DETAIL_KEYS.filter((k) => viewReport.reportDetails?.[k]).map((k) => (
                <Box key={k} sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{detailLabelFor(viewReport, k)}</Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{viewReport.reportDetails[k]}</Typography>
                </Box>
              ))}

              {(viewReport.overallSummary || viewReport.resultsSummary) && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Overall Clinical Summary</Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{viewReport.overallSummary || viewReport.resultsSummary}</Typography>
                </Box>
              )}

              <Divider sx={{ my: 2 }} />
              <Typography variant="caption" color="text.secondary" display="block">
                Attachment: {viewReport.ipfsCid || viewReport.fileUrl || viewReport.pdfUrl ? (viewReport.ipfsCid || viewReport.fileUrl || viewReport.pdfUrl) : 'None'}
              </Typography>
              {viewReport.reportHash && (
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  Report hash: {viewReport.reportHash}
                </Typography>
              )}
            </DialogContent>
            <DialogActions sx={{ p: 2 }}>
              {viewReport.secureFile ? (
                <>
                  <Chip 
                    label="Available in My Documents" 
                    color="success" 
                    variant="outlined" 
                    size="small" 
                    sx={{ mr: 'auto', fontWeight: 600 }} 
                  />
                  <Button 
                    onClick={handleDownload} 
                    variant="contained" 
                    color="primary" 
                    startIcon={<DownloadIcon />} 
                    disabled={downloading}
                  >
                    {downloading ? 'Downloading...' : 'Download'}
                  </Button>
                </>
              ) : (
                <Button 
                  onClick={handleDownloadManualPdf} 
                  variant="contained" 
                  color="primary" 
                  startIcon={<DownloadIcon />} 
                  disabled={downloadingPdf}
                  sx={{ mr: 'auto' }}
                >
                  {downloadingPdf ? 'Generating PDF...' : 'Download PDF'}
                </Button>
              )}
              <Button onClick={closeViewReport}>Close</Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* ── Create report ────────────────────────────────────────────────────────────────────────────────────── */}
      {canCreate && (
        <Dialog open={openDialog} onClose={closeCreate} maxWidth="md" fullWidth>
          <form onSubmit={handleCreate}>
            <DialogTitle sx={{ fontWeight: 700 }}>Record Lab / Diagnostic Report</DialogTitle>
            <DialogContent dividers>
              {formError && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setFormError(null)}>
                  {formError}
                </Alert>
              )}
              
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>How would you like to add the report?</Typography>
                <ToggleButtonGroup
                  color="primary"
                  value={creationMode}
                  exclusive
                  onChange={(e, val) => {
                    if (val) {
                      setCreationMode(val);
                      setFormError(null);
                    }
                  }}
                  fullWidth
                >
                  <ToggleButton value="manual">Manual Entry</ToggleButton>
                  <ToggleButton value="upload">Upload Existing Report</ToggleButton>
                </ToggleButtonGroup>
              </Box>

              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    label="Patient ID"
                    value={form.patientId}
                    onChange={(e) => setForm({ ...form, patientId: e.target.value })}
                    required
                    helperText="MongoDB ObjectId of the patient"
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 3 }}>
                  <TextField
                    fullWidth
                    type="date"
                    label="Date"
                    value={form.reportDate}
                    onChange={(e) => setForm({ ...form, reportDate: e.target.value })}
                    slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: todayISO() } }}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 3 }}>
                  <TextField fullWidth label="Ordering Doctor" value={name ? `Dr. ${name}` : '—'} disabled helperText="Signed-in doctor" />
                </Grid>

                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField select fullWidth required label="Investigation Category" value={form.category} onChange={(e) => setCategory(e.target.value)}>
                    {INVESTIGATION_CATEGORIES.map((c) => (
                      <MenuItem key={c} value={c}>{c}</MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField select fullWidth required label="Investigation Type" value={form.type} onChange={(e) => setType(e.target.value)} disabled={!form.category}>
                    {typesFor(form.category).map((t) => (
                      <MenuItem key={t} value={t}>{t}</MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField select fullWidth required label="Specific Test" value={form.test} onChange={(e) => setTest(e.target.value)} disabled={!form.type}>
                    {testsFor(form.category, form.type).map((t) => (
                      <MenuItem key={t} value={t}>{t}</MenuItem>
                    ))}
                    <MenuItem value={OTHER_TEST}><em>Other (specify)</em></MenuItem>
                  </TextField>
                </Grid>
                {form.test === OTHER_TEST && (
                  <Grid size={12}>
                    <TextField fullWidth required label="Test Name" value={form.customTestName} onChange={(e) => setForm({ ...form, customTestName: e.target.value })} />
                  </Grid>
                )}
              </Grid>

              {creationMode === 'manual' && template && (
                <>
                  {(form.rows.length > 0 || template.customRows) && (
                    <Box sx={{ mt: 3 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Results</Typography>
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                        All fields are optional — rows left without a result are not saved.{template.rowHint ? ` Rows: ${template.rowHint}.` : ''}
                      </Typography>
                      {form.rows.map((r, i) => (
                        <Grid container spacing={1} key={i} sx={{ mb: 1 }} alignItems="center">
                          <Grid size={{ xs: 12, sm: 3 }}>
                            <TextField
                              fullWidth size="small" label="Parameter" value={r.parameter}
                              onChange={(e) => updateRow(i, { parameter: e.target.value })}
                              slotProps={{ input: { readOnly: r.fixed } }}
                            />
                          </Grid>
                          <Grid size={{ xs: 6, sm: 2 }}>
                            <TextField fullWidth size="small" label="Result" value={r.value} onChange={(e) => updateRow(i, { value: e.target.value })} />
                          </Grid>
                          <Grid size={{ xs: 6, sm: 2 }}>
                            <TextField fullWidth size="small" label="Unit" value={r.unit} onChange={(e) => updateRow(i, { unit: e.target.value })} />
                          </Grid>
                          <Grid size={{ xs: 6, sm: 2 }}>
                            <TextField fullWidth size="small" label="Reference Range" value={r.referenceRange} onChange={(e) => updateRow(i, { referenceRange: e.target.value })} />
                          </Grid>
                          <Grid size={{ xs: 4, sm: 2 }}>
                            <TextField select fullWidth size="small" label="Flag" value={r.flag} onChange={(e) => updateRow(i, { flag: e.target.value })}>
                              {FLAGS.map((f) => <MenuItem key={f} value={f}>{f}</MenuItem>)}
                            </TextField>
                          </Grid>
                          <Grid size={{ xs: 2, sm: 1 }}>
                            {!r.fixed && (
                              <IconButton size="small" onClick={() => removeRow(i)} aria-label="Remove row">
                                <DeleteOutlineIcon fontSize="small" />
                              </IconButton>
                            )}
                          </Grid>
                        </Grid>
                      ))}
                      {template.customRows && (
                        <Button size="small" startIcon={<AddIcon />} onClick={addRow} sx={{ textTransform: 'none' }}>
                          Add result row
                        </Button>
                      )}
                    </Box>
                  )}

                  {template.details.length > 0 && (
                    <Grid container spacing={2} sx={{ mt: 1 }}>
                      {template.details.map(({ key, label }) => (
                        <Grid size={{ xs: 12, sm: key === 'specimen' || key === 'bodyRegion' ? 6 : 12 }} key={key}>
                          <TextField
                            fullWidth
                            label={label}
                            value={form.details[key] || ''}
                            onChange={(e) => updateDetail(key, e.target.value)}
                            multiline={!(key === 'specimen' || key === 'bodyRegion')}
                            minRows={key === 'findings' ? 3 : 1}
                          />
                        </Grid>
                      ))}
                    </Grid>
                  )}
                </>
              )}

              {creationMode === 'manual' && (
                <Grid container spacing={2} sx={{ mt: 1 }}>
                  <Grid size={12}>
                    <TextField
                      fullWidth
                      label="Overall Clinical Summary"
                      multiline
                      rows={2}
                      value={form.overallSummary}
                      onChange={(e) => setForm({ ...form, overallSummary: e.target.value })}
                    />
                  </Grid>
                </Grid>
              )}
              
              {creationMode === 'upload' && (
                <Grid container spacing={2} sx={{ mt: 1 }}>
                  <Grid size={12}>
                    <Box sx={{ border: '1px dashed #cbd5e1', borderRadius: '8px', p: 2, bgcolor: '#f8fafc' }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>Upload Report File</Typography>
                      <Button variant="outlined" component="label" startIcon={<CloudUploadIcon />} sx={{ textTransform: 'none', mr: 2 }}>
                        Choose File
                        <input hidden type="file" accept={ATTACHMENT_ACCEPT} onChange={(e) => setForm({ ...form, file: e.target.files[0] })} />
                      </Button>
                      <Typography variant="body2" component="span" sx={{ color: form.file ? 'text.primary' : 'text.secondary' }}>
                        {form.file ? form.file.name : 'No file selected'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                        Allowed file types: PDF, JPG, JPEG, PNG
                      </Typography>
                    </Box>
                  </Grid>
                </Grid>
              )}

            </DialogContent>
            <DialogActions sx={{ p: 2 }}>
              <Button onClick={closeCreate}>Cancel</Button>
              <Button type="submit" variant="contained" disabled={saving} sx={{ bgcolor: '#059669' }}>
                {saving ? 'Saving…' : 'Save Report'}
              </Button>
            </DialogActions>
          </form>
        </Dialog>
      )}
    </Box>
  );
}
