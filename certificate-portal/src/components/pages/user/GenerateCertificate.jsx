import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Grid,
  Alert,
  TextField,
  Divider,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import { LocalHospital, VerifiedUser, AddCircle } from '@mui/icons-material';
import { apiFetch } from '../../../utils/api';
import forge from 'node-forge';

const GenerateCertificate = () => {
  const [loading, setLoading] = useState(false);
  const [doctors, setDoctors] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [selectedDoctor, setSelectedDoctor] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [docsData, docsDocsData] = await Promise.all([
          apiFetch('/api/patient/doctors'),
          apiFetch('/api/patient/documents')
        ]);
        setDoctors(docsData || []);
        setDocuments(docsDocsData || []);
        if (docsData && docsData.length > 0) setSelectedDoctor(docsData[0]._id);
      } catch (err) {
        console.error("Failed to fetch data:", err);
      }
    };
    fetchData();
  }, []);

  // Mock certificate types
  const certificateTypes = [
    {
      id: 'vaccine',
      title: 'Vaccine Certificate',
      description: 'Generate a digital vaccine certificate (requires an uploaded vaccine document with doctor access)',
      icon: <LocalHospital />,
      requiredFields: ['Patient Name', 'Vaccine Type', 'Dose Number', 'Date Administered', 'Document Access']
    }
  ];

  const requestCertificate = async (type) => {
    if (!selectedDoctor) {
      alert("Please select a doctor to request the certificate from. Ensure you have an assigned doctor.");
      return;
    }

    let doctorEncryptedKeyToSend = null;
    let docIdToApprove = null;

    if (type === 'vaccine') {
      const vaccineDoc = documents.find(d => d.type === 'vaccine_certificate');
      if (!vaccineDoc) {
        alert("You cannot request a vaccine certificate without an uploaded vaccine document. Please check My Documents.");
        return;
      }

      const docDoctor = doctors.find(d => d._id === selectedDoctor);
      if (!docDoctor || !docDoctor.publicKey) {
        alert("Doctor public key not found, cannot grant access.");
        return;
      }

      const privateKeyStr = window.prompt("To securely give the doctor access to your vaccine document and request a certificate, please paste your RSA Private Key:");
      if (!privateKeyStr) return;

      try {
        const privateKey = forge.pki.privateKeyFromPem(privateKeyStr);
        const decodedPatientEncryptedKey = forge.util.decode64(vaccineDoc.patientEncryptedKey);
        const aesKey = privateKey.decrypt(decodedPatientEncryptedKey, 'RSA-OAEP', {
          md: forge.md.sha256.create(),
          mgf1: { md: forge.md.sha256.create() }
        });

        const doctorPublicKey = forge.pki.publicKeyFromPem(docDoctor.publicKey);
        const docEncKey = doctorPublicKey.encrypt(aesKey, 'RSA-OAEP', {
          md: forge.md.sha256.create(),
          mgf1: { md: forge.md.sha256.create() }
        });

        doctorEncryptedKeyToSend = forge.util.encode64(docEncKey);
        docIdToApprove = vaccineDoc._id;
      } catch (err) {
        alert("Failed to process security keys. Please check your private key.");
        return;
      }
    }

    setLoading(true);

    try {
      if (type === 'vaccine' && docIdToApprove && doctorEncryptedKeyToSend) {
        await apiFetch(`/api/patient/documents/${docIdToApprove}/approve`, {
          method: 'POST',
          body: JSON.stringify({
            doctorId: selectedDoctor,
            doctorEncryptedKey: doctorEncryptedKeyToSend
          })
        });
      }

      await apiFetch('/api/patient/certificates/request', {
        method: 'POST',
        body: JSON.stringify({
          doctorRequested: selectedDoctor,
          certificateType: type,
          reason: reason || `Requested ${type} certificate`
        })
      });

      alert(`✅ Certificate request submitted to the doctor!`);
      setReason('');
    } catch (error) {
      console.error(error);
      alert(`Failed to request certificate: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };



  return (
    <Card elevation={3} sx={{ mb: 4 }}>
      <CardContent>
        <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <LocalHospital /> Certificate Generation
        </Typography>

        <Typography variant="body2" color="text.secondary" paragraph>
          Generate digital medical certificates. These certificates can be shared with authorized doctors.
        </Typography>



        <Divider sx={{ my: 2 }} />

        {/* Certificate Type Selection */}
        <Typography variant="h6" gutterBottom>
          Select Certificate Type
        </Typography>

        <Grid container spacing={3}>
          {certificateTypes.map((certType) => (
            <Grid item xs={12} md={4} key={certType.id}>
              <Card
                variant="outlined"
                sx={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'transform 0.2s',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: 3
                  }
                }}
              >
                <CardContent sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    {certType.icon}
                    <Typography variant="h6">
                      {certType.title}
                    </Typography>
                  </Box>

                  <Typography variant="body2" paragraph sx={{ flexGrow: 1 }}>
                    {certType.description}
                  </Typography>

                  <Box sx={{ mb: 2 }}>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Required Information:
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                      {certType.requiredFields.map((field, idx) => (
                        <Chip
                          key={idx}
                          label={field}
                          size="small"
                          variant="outlined"
                        />
                      ))}
                    </Box>
                  </Box>

                  <Button
                    variant="contained"
                    fullWidth
                    onClick={() => requestCertificate(certType.id)}
                    disabled={loading || !selectedDoctor}
                    sx={{ mt: 'auto' }}
                  >
                    {loading ? 'Requesting...' : `Request ${certType.title}`}
                  </Button>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        {/* Instructions */}
        <Box sx={{ mt: 4, p: 2, backgroundColor: '#e8f5e9', borderRadius: 2 }}>
          <Typography variant="subtitle2" gutterBottom color="success.main">
            💡 How it works:
          </Typography>
          <Typography variant="body2" component="div">
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              <li>Select your assigned doctor and the type of certificate you need.</li>
              <li>Provide an optional reason or note for the request.</li>
              <li>The doctor will review your request and issue a verifiable digital certificate.</li>
            </ul>
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
};

export default GenerateCertificate;