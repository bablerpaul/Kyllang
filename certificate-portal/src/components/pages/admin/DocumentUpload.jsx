import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Alert,
  Grid,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Divider,
  LinearProgress,
  Paper,
  TextField
} from '@mui/material';
import {
  Upload as UploadIcon,
  Description as DescriptionIcon,
  Person as PersonIcon,
  Delete as DeleteIcon,
  CloudUpload as CloudUploadIcon,
  CheckCircle as CheckCircleIcon
} from '@mui/icons-material';
import { apiFetch } from '../../../utils/api';
import forge from 'node-forge';

const DocumentUpload = () => {
  const [users, setUsers] = useState([]);

  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [documentName, setDocumentName] = useState('');
  const [documentType, setDocumentType] = useState('blood_test');

  // Dynamic Form State
  const [formValues, setFormValues] = useState({});
  const [jsonPayload, setJsonPayload] = useState('');

  const [isUploading, setIsUploading] = useState(false);

  const documentTypes = [
    { value: 'vaccine_certificate', label: 'Vaccine Certificate' },
    { value: 'blood_test', label: 'Blood Test Report' },
    { value: 'other', label: 'Other (Raw JSON)' }
  ];

  const fetchUsers = useCallback(async () => {
    try {
      const data = await apiFetch('/api/admin/users');
      setUsers(data || []);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleFormChange = (field, value) => {
    setFormValues(prev => ({ ...prev, [field]: value }));
  };

  const handleUpload = async () => {
    if (!selectedPatientId || !documentName.trim() || !documentType) {
      alert('Please fill out all required fields');
      return;
    }

    const patient = users.find(u => u._id === selectedPatientId);
    if (!patient || !patient.publicKey) {
      alert("Selected patient does not have a public key to encrypt the document.");
      return;
    }

    setIsUploading(true);

    try {
      // 1. Generate JSON doc based on type
      let docData = {};
      if (documentType === 'blood_test') {
        docData = {
          bloodType: formValues.bloodType || 'Unknown',
          hemoglobin: formValues.hemoglobin || 'N/A',
          wbcCount: formValues.wbcCount || 'N/A',
          resultDate: formValues.resultDate || new Date().toISOString().split('T')[0]
        };
      } else if (documentType === 'vaccine_certificate') {
        docData = {
          vaccineName: formValues.vaccineName || 'Unknown',
          doses: formValues.doses || '1',
          dateAdministered: formValues.dateAdministered || new Date().toISOString().split('T')[0]
        };
      } else {
        try {
          docData = JSON.parse(jsonPayload || '{}');
        } catch (e) {
          alert("Invalid JSON payload");
          setIsUploading(false);
          return;
        }
      }

      const documentStr = JSON.stringify(docData);

      // 2. Encrypt document with AES
      const aesKey = forge.random.getBytesSync(32); // 256 bits
      const iv = forge.random.getBytesSync(12); // Standard for GCM
      const cipher = forge.cipher.createCipher('AES-GCM', aesKey);
      cipher.start({ iv: iv });
      cipher.update(forge.util.createBuffer(documentStr, 'utf8'));
      cipher.finish();

      const encryptedData = cipher.output.getBytes();
      const tag = cipher.mode.tag.getBytes();
      // Combine IV + TAG + DATA and base64 encode
      const combinedEncryptedDocument = forge.util.encode64(iv + tag + encryptedData);

      // 3. Encrypt AES key with Patient's Public RSA Key
      const publicKey = forge.pki.publicKeyFromPem(patient.publicKey);
      const encryptedAesKey = publicKey.encrypt(aesKey, 'RSA-OAEP', {
        md: forge.md.sha256.create(),
        mgf1: {
          md: forge.md.sha256.create()
        }
      });
      const encodedEncryptedAesKey = forge.util.encode64(encryptedAesKey);

      // 4. Send to backend
      await apiFetch('/api/admin/documents', {
        method: 'POST',
        body: JSON.stringify({
          patientId: selectedPatientId,
          title: documentName,
          type: documentType,
          encryptedData: combinedEncryptedDocument,
          patientEncryptedKey: encodedEncryptedAesKey
        })
      });

      alert('✅ Document uploaded successfully!');
      setDocumentName('');
      setFormValues({});
      setJsonPayload('');

    } catch (error) {
      console.error(error);
      alert(`Upload failed: ${error.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteDocument = (patientId, documentId, documentName) => {
    alert("Delete document not fully implemented for PoC API.");
  };

  const selectedPatient = selectedPatientId ? users.find(u => u._id === selectedPatientId) : null;
  const patients = users.filter(u => u.role === 'general_user');

  return (
    <Box>
      <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <UploadIcon /> Document Upload Management
      </Typography>

      <Grid container spacing={3}>
        {/* Upload Form */}
        <Grid item xs={12} md={6}>
          <Card elevation={3}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Upload Document to Patient
              </Typography>

              <FormControl fullWidth sx={{ mb: 3 }}>
                <InputLabel>Select Patient</InputLabel>
                <Select
                  value={selectedPatientId}
                  label="Select Patient"
                  onChange={(e) => setSelectedPatientId(e.target.value)}
                >
                  <MenuItem value="">
                    <em>Select a patient</em>
                  </MenuItem>
                  {patients.map((patient) => (
                    <MenuItem key={patient._id || patient.id} value={patient._id || patient.id}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <PersonIcon fontSize="small" />
                        {patient.name} ({patient.email || patient.patientId})
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl fullWidth sx={{ mb: 3 }}>
                <InputLabel>Document Type</InputLabel>
                <Select
                  value={documentType}
                  label="Document Type"
                  onChange={(e) => setDocumentType(e.target.value)}
                >
                  <MenuItem value="">
                    <em>Select document type</em>
                  </MenuItem>
                  {documentTypes.map((type) => (
                    <MenuItem key={type.value} value={type.value}>
                      {type.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Box sx={{ mb: 3 }}>
                <TextField
                  fullWidth
                  label="Document Title"
                  value={documentName}
                  onChange={(e) => setDocumentName(e.target.value)}
                  placeholder="E.g., Complete Blood Count - Nov 2023"
                  sx={{ mb: 2 }}
                />

                {documentType === 'blood_test' && (
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <TextField fullWidth label="Blood Type" value={formValues.bloodType || ''} onChange={(e) => handleFormChange('bloodType', e.target.value)} />
                    </Grid>
                    <Grid item xs={6}>
                      <TextField fullWidth label="Hemoglobin (g/dL)" value={formValues.hemoglobin || ''} onChange={(e) => handleFormChange('hemoglobin', e.target.value)} />
                    </Grid>
                    <Grid item xs={6}>
                      <TextField fullWidth label="WBC Count (x10^9/L)" value={formValues.wbcCount || ''} onChange={(e) => handleFormChange('wbcCount', e.target.value)} />
                    </Grid>
                    <Grid item xs={6}>
                      <TextField fullWidth type="date" label="Result Date" InputLabelProps={{ shrink: true }} value={formValues.resultDate || ''} onChange={(e) => handleFormChange('resultDate', e.target.value)} />
                    </Grid>
                  </Grid>
                )}

                {documentType === 'vaccine_certificate' && (
                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                      <TextField fullWidth label="Vaccine Name" placeholder="e.g. Pfizer-BioNTech COVID-19" value={formValues.vaccineName || ''} onChange={(e) => handleFormChange('vaccineName', e.target.value)} />
                    </Grid>
                    <Grid item xs={6}>
                      <TextField fullWidth type="number" label="Dose Number" value={formValues.doses || ''} onChange={(e) => handleFormChange('doses', e.target.value)} />
                    </Grid>
                    <Grid item xs={6}>
                      <TextField fullWidth type="date" label="Date Administered" InputLabelProps={{ shrink: true }} value={formValues.dateAdministered || ''} onChange={(e) => handleFormChange('dateAdministered', e.target.value)} />
                    </Grid>
                  </Grid>
                )}

                {documentType === 'other' && (
                  <TextField
                    fullWidth
                    multiline
                    rows={6}
                    label="Raw JSON Payload"
                    placeholder='{"key": "value"}'
                    value={jsonPayload}
                    onChange={(e) => setJsonPayload(e.target.value)}
                  />
                )}
              </Box>

              <Button
                variant="contained"
                fullWidth
                size="large"
                startIcon={<CheckCircleIcon />}
                onClick={handleUpload}
                disabled={isUploading || !selectedPatientId || !documentName || !documentType}
              >
                {isUploading ? 'Encrypting & Generating...' : 'Generate & Upload Encrypted Document'}
              </Button>

              <Alert severity="info" sx={{ mt: 2 }}>
                <Typography variant="body2">
                  Document data will be encrypted locally using AES-256-GCM. The decryption key is encrypted using the patient's RSAPublicKey.
                </Typography>
              </Alert>
            </CardContent>
          </Card>

          {/* Patient Info */}
          {selectedPatient && (
            <Card elevation={2} sx={{ mt: 3 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <PersonIcon /> Selected Patient
                </Typography>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2" color="text.secondary">Name:</Typography>
                  <Typography variant="body2">{selectedPatient.name}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2" color="text.secondary">Patient ID:</Typography>
                  <Typography variant="body2">{selectedPatient.patientId || selectedPatient._id}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2" color="text.secondary">Documents:</Typography>
                  <Chip label={selectedPatient.documents?.length || 0} size="small" />
                </Box>
              </CardContent>
            </Card>
          )}
        </Grid>

        {/* Patient Documents List */}
        <Grid item xs={12} md={6}>
          <Card elevation={3} sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <DescriptionIcon /> Patient Documents
              </Typography>

              {selectedPatient ? (
                <>
                  <Box sx={{ mb: 2 }}>
                    <Chip
                      label={`${selectedPatient.documents?.length || 0} documents`}
                      color="primary"
                      size="small"
                    />
                    <Chip
                      label={selectedPatient.name}
                      variant="outlined"
                      size="small"
                      sx={{ ml: 1 }}
                    />
                  </Box>

                  {!selectedPatient.documents || selectedPatient.documents.length === 0 ? (
                    <Alert severity="info">
                      No documents found for this patient. Upload documents using the form.
                    </Alert>
                  ) : (
                    <List sx={{ maxHeight: 400, overflow: 'auto' }}>
                      {selectedPatient.documents.map((doc) => (
                        <Paper key={doc.id || doc._id} variant="outlined" sx={{ mb: 1 }}>
                          <ListItem>
                            <ListItemText
                              primary={
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <DescriptionIcon fontSize="small" />
                                  <Typography variant="subtitle2">{doc.title || doc.name}</Typography>
                                  <Chip label={doc.type} size="small" variant="outlined" />
                                </Box>
                              }
                              secondary={
                                <>
                                  <Typography variant="caption" display="block">
                                    Uploaded: {new Date(doc.createdAt || doc.uploadDate).toLocaleDateString()}
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary">
                                    ID: {doc._id || doc.id}
                                  </Typography>
                                </>
                              }
                            />
                            <ListItemSecondaryAction>
                              <IconButton
                                edge="end"
                                aria-label="delete"
                                onClick={() => handleDeleteDocument(selectedPatient._id, doc._id, doc.title)}
                                size="small"
                                color="error"
                              >
                                <DeleteIcon />
                              </IconButton>
                            </ListItemSecondaryAction>
                          </ListItem>
                        </Paper>
                      ))}
                    </List>
                  )}
                </>
              ) : (
                <Alert severity="info">
                  Select a patient to view their documents.
                </Alert>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Statistics */}
      <Grid container spacing={2} sx={{ mt: 3 }}>
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="h4" color="primary.main">
              {patients.reduce((total, patient) => total + (patient.documents?.length || 0), 0)}
            </Typography>
            <Typography variant="caption">Total Documents</Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="h4" color="success.main">
              {documentTypes.length}
            </Typography>
            <Typography variant="caption">Document Types</Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="h4" color="warning.main">
              {patients.length}
            </Typography>
            <Typography variant="caption">Active Patients</Typography>
          </Paper>
        </Grid>
      </Grid>

      <Alert severity="warning" sx={{ mt: 3 }}>
        <Typography variant="body2">
          <strong>Important:</strong> Ensure all uploaded documents comply with HIPAA regulations
          and patient privacy requirements. Only upload documents for which you have proper authorization.
        </Typography>
      </Alert>
    </Box>
  );
};

export default DocumentUpload;