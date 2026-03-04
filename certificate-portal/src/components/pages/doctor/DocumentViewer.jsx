import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  Button,
  Chip,
  Divider,
  Alert,
  Card,
  CardContent,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Lock as LockIcon,
  Visibility as VisibilityIcon,
  Description as DescriptionIcon,
  CalendarToday as CalendarIcon,
  Person as PersonIcon,
  Print as PrintIcon
} from '@mui/icons-material';
import forge from 'node-forge';
import { apiFetch } from '../../../utils/api';
import { decryptKeyWithX25519 } from '../../../utils/cryptoUtils';
import DocumentRenderer from '../shared/DocumentRenderer';
import PrivateKeyDialog from '../../shared/PrivateKeyDialog';

const DocumentViewer = () => {
  const { docId } = useParams();
  const navigate = useNavigate();
  const [documentData, setDocumentData] = useState(null);
  const preventContextMenu = true; // Always true for Doctors
  const [error, setError] = useState('');
  const [isDecrypting, setIsDecrypting] = useState(false);
  const printRef = useRef(null);
  const hasFetched = useRef(false);

  const [privateKeyDialogOpen, setPrivateKeyDialogOpen] = useState(false);
  const [pendingDocData, setPendingDocData] = useState(null);

  useEffect(() => {
    // Disable right-click, selection, print, etc...
    const handleContextMenu = (e) => {
      if (preventContextMenu) {
        e.preventDefault();
        alert('Right-click is disabled for document security.');
      }
    };
    const handleSelectStart = (e) => {
      if (preventContextMenu) e.preventDefault();
    };
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 's')) {
        e.preventDefault();
        alert('Printing and saving are disabled for document security.');
      }
    };

    window.document.addEventListener('contextmenu', handleContextMenu);
    window.document.addEventListener('selectstart', handleSelectStart);
    window.document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.document.removeEventListener('contextmenu', handleContextMenu);
      window.document.removeEventListener('selectstart', handleSelectStart);
      window.document.removeEventListener('keydown', handleKeyDown);
    };
  }, [preventContextMenu]);

  useEffect(() => {
    const fetchDocument = async () => {
      try {
        if (hasFetched.current) return;
        hasFetched.current = true;

        const docRes = await apiFetch(`/api/doctor/documents/${docId}`);
        setPendingDocData(docRes);
        setPrivateKeyDialogOpen(true);
      } catch (err) {
        console.error(err);
        setError('Failed to fetch document.');
      }
    };
    fetchDocument();
  }, [docId]);

  const handlePrivateKeySubmit = (privateKeyStr) => {
    setPrivateKeyDialogOpen(false);
    if (!pendingDocData) return;
    setIsDecrypting(true);

    try {
      // Decrypt AES key using X25519
      const aesKey = decryptKeyWithX25519(pendingDocData.doctorEncryptedKey, privateKeyStr);

      // Decrypt Document Data
      const combinedData = forge.util.decode64(pendingDocData.encryptedData);
      const iv = combinedData.substring(0, 12);
      const tag = combinedData.substring(12, 28);
      const encryptedContent = combinedData.substring(28);

      const decipher = forge.cipher.createDecipher('AES-GCM', aesKey);
      decipher.start({
        iv: iv,
        tag: forge.util.createBuffer(tag)
      });
      decipher.update(forge.util.createBuffer(encryptedContent));
      const pass = decipher.finish();

      if (pass) {
        const rawJson = decipher.output.toString('utf8');
        let parsedContent = rawJson;
        try {
          const obj = JSON.parse(rawJson);
          parsedContent = JSON.stringify(obj, null, 2);
        } catch (e) { }

        setDocumentData({
          ...pendingDocData,
          issueDate: new Date(pendingDocData.createdAt).toLocaleDateString(),
          content: parsedContent,
          doctorName: 'You' // Current mapped doctor
        });
      } else {
        setError('Decryption failed. Document may be compromised or key is incorrect.');
      }
    } catch (err) {
      console.error(err);
      setError('Failed to decrypt document. Ensure you have access and the correct key. ' + err.message);
    } finally {
      setIsDecrypting(false);
      setPendingDocData(null);
    }
  };

  if (error) {
    return (
      <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)} sx={{ mb: 2 }}>Back</Button>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  if (isDecrypting || !documentData) {
    return (
      <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
        <Typography>{isDecrypting ? 'Decrypting secure document, please wait...' : 'Loading document...'}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate(-1)}
          sx={{ mr: 2 }}
        >
          Back
        </Button>
        <Typography variant="h4" sx={{ flexGrow: 1 }}>
          Document Viewer
        </Typography>
      </Box>

      {/* Document Info Card */}
      <Card elevation={2} sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
            <Box>
              <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <DescriptionIcon /> {documentData.title}
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <Chip icon={<PersonIcon />} label={`Patient: ${documentData.patientName}`} size="small" />
                <Chip icon={<CalendarIcon />} label={`Issued: ${documentData.issueDate}`} size="small" />
                <Chip icon={<VisibilityIcon />} label="Read Only" size="small" color="info" />
              </Box>
            </Box>

            <Chip
              label={documentData.status}
              color={documentData.status === 'Valid' ? 'success' : 'warning'}
              variant="outlined"
            />
          </Box>

          <Divider sx={{ my: 2 }} />

          <Alert severity="warning" icon={<LockIcon />}>
            <Typography variant="body2">
              <strong>Security Notice:</strong> This document is in read-only mode.
              {preventContextMenu && ' Right-click, text selection, and printing are disabled.'}
              Downloading and copying are restricted for patient privacy.
            </Typography>
          </Alert>
        </CardContent>
      </Card>

      {/* Document Content */}
      <Paper
        elevation={1}
        sx={{
          p: 4,
          minHeight: 600,
          backgroundColor: '#fafafa',
          border: '1px solid #e0e0e0',
          borderRadius: 2,
          position: 'relative',
          userSelect: preventContextMenu ? 'none' : 'auto',
          WebkitUserSelect: preventContextMenu ? 'none' : 'auto',
          MozUserSelect: preventContextMenu ? 'none' : 'auto',
          msUserSelect: preventContextMenu ? 'none' : 'auto',
          '&::after': preventContextMenu ? {
            content: '"READ ONLY - PROTECTED"',
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%) rotate(-45deg)',
            fontSize: '4rem',
            color: 'rgba(0,0,0,0.1)',
            fontWeight: 'bold',
            pointerEvents: 'none',
            zIndex: 1
          } : null
        }}
      >
        <Box sx={{ position: 'relative', zIndex: 2 }}>
          {/* Watermark */}
          {preventContextMenu && (
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(0,0,0,0.02) 10px, rgba(0,0,0,0.02) 20px)',
                pointerEvents: 'none'
              }}
            />
          )}

          <Typography variant="h6" gutterBottom align="center" color="primary">
            MEDICAL RECORD
          </Typography>

          <Divider sx={{ my: 3 }} />

          <Box ref={printRef} sx={{ backgroundColor: 'white' }}>
            <DocumentRenderer documentData={documentData} parsedContent={documentData.content} />
          </Box>

          <Divider sx={{ my: 3 }} />

          {/* Security Footer */}
          <Box sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            mt: 4,
            pt: 2,
            borderTop: '2px solid #e0e0e0'
          }}>
            <Typography variant="caption" color="text.secondary">
              Certificate ID: {documentData._id} | Accessed by: {documentData.doctorName}
            </Typography>

            <Box sx={{ display: 'flex', gap: 1 }}>
              <Tooltip title="Print, Download, and Copying are Disabled">
                <span>
                  <IconButton disabled size="small">
                    <PrintIcon />
                  </IconButton>
                </span>
              </Tooltip>
            </Box>
          </Box>
        </Box>
      </Paper>

      {/* Footer Notice */}
      <Alert severity="info" sx={{ mt: 3 }}>
        <Typography variant="body2">
          <strong>Usage Restrictions:</strong> This document viewer is for medical professional use only.
          All access is logged and monitored. Unauthorized sharing or duplication violates patient privacy laws.
        </Typography>
      </Alert>

      <PrivateKeyDialog
        open={privateKeyDialogOpen}
        onClose={() => {
          setPrivateKeyDialogOpen(false);
          if (!documentData) setError('Private key is required to view this document.');
        }}
        onSubmit={handlePrivateKeySubmit}
        title="View Secure Document"
      />
    </Box>
  );
};

export default DocumentViewer;