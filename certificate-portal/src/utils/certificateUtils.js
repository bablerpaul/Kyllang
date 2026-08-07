// Utility functions for certificate management
export const generateCertificateId = () => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substr(2, 9);
  return `CERT-${timestamp}-${random}`.toUpperCase();
};

export const formatCertificateDate = (dateString) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const validateCertificateData = (data) => {
  const requiredFields = ['type', 'patientName', 'date'];
  const missingFields = requiredFields.filter(field => !data[field]);
  
  if (missingFields.length > 0) {
    return {
      valid: false,
      message: `Missing required fields: ${missingFields.join(', ')}`
    };
  }
  
  return { valid: true };
};

// Mock certificate storage
export const storeCertificate = (certificate) => {
  try {
    const certificates = JSON.parse(localStorage.getItem('user_certificates') || '[]');
    certificates.push({
      ...certificate,
      id: generateCertificateId(),
      createdAt: new Date().toISOString()
    });
    localStorage.setItem('user_certificates', JSON.stringify(certificates));
    return true;
  } catch (error) {
    console.error('Error storing certificate:', error);
    return false;
  }
};

export const getUserCertificates = () => {
  try {
    return JSON.parse(localStorage.getItem('user_certificates') || '[]');
  } catch (error) {
    console.error('Error retrieving certificates:', error);
    return [];
  }
};