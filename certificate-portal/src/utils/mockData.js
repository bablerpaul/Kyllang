// Mock data for doctor portal
export const mockPatients = [
  {
    id: 1,
    patientId: 'PAT-001',
    name: 'John Doe',
    age: 45,
    gender: 'Male',
    bloodGroup: 'O+',
    lastVisit: '2024-12-10',
    status: 'Active',
    conditions: ['Hypertension', 'Type 2 Diabetes'],
    contact: '+1-555-0123',
    assignedDate: '2024-01-15'
  },
  {
    id: 2,
    patientId: 'PAT-002',
    name: 'Jane Smith',
    age: 32,
    gender: 'Female',
    bloodGroup: 'A+',
    lastVisit: '2024-12-11',
    status: 'Active',
    conditions: ['Asthma', 'Allergies'],
    contact: '+1-555-0124',
    assignedDate: '2024-02-20'
  },
  {
    id: 3,
    patientId: 'PAT-003',
    name: 'Robert Johnson',
    age: 58,
    gender: 'Male',
    bloodGroup: 'B+',
    lastVisit: '2024-12-05',
    status: 'Inactive',
    conditions: ['Arthritis', 'High Cholesterol'],
    contact: '+1-555-0125',
    assignedDate: '2023-11-10'
  },
  {
    id: 4,
    patientId: 'PAT-004',
    name: 'Maria Garcia',
    age: 29,
    gender: 'Female',
    bloodGroup: 'AB+',
    lastVisit: '2024-12-12',
    status: 'Active',
    conditions: ['Migraine', 'Anemia'],
    contact: '+1-555-0126',
    assignedDate: '2024-03-05'
  }
];

export const mockDocuments = {
  1: [ // Documents for patient with id 1
    {
      id: 'DOC-101',
      name: 'Vaccine Certificate - COVID-19',
      type: 'vaccine',
      uploadDate: '2024-01-15',
      size: '1.2 MB',
      status: 'pending', // pending, granted, denied
      requested: false
    },
    {
      id: 'DOC-102',
      name: 'Blood Test Results - Complete Panel',
      type: 'lab_report',
      uploadDate: '2024-02-10',
      size: '0.8 MB',
      status: 'pending',
      requested: false
    },
    {
      id: 'DOC-103',
      name: 'X-Ray - Chest',
      type: 'imaging',
      uploadDate: '2024-03-05',
      size: '2.5 MB',
      status: 'pending',
      requested: false
    },
    {
      id: 'DOC-104',
      name: 'Medical History Summary',
      type: 'history',
      uploadDate: '2024-01-20',
      size: '0.5 MB',
      status: 'pending',
      requested: false
    }
  ],
  2: [
    {
      id: 'DOC-201',
      name: 'Allergy Test Results',
      type: 'lab_report',
      uploadDate: '2024-02-15',
      size: '1.1 MB',
      status: 'pending',
      requested: false
    },
    {
      id: 'DOC-202',
      name: 'Pulmonary Function Test',
      type: 'diagnostic',
      uploadDate: '2024-03-10',
      size: '1.8 MB',
      status: 'pending',
      requested: false
    }
  ]
};

export const mockGrantedDocuments = [
  {
    id: 'DOC-001-GRANTED',
    patientId: 1,
    patientName: 'John Doe',
    documentName: 'Vaccine Record 2023',
    grantedDate: '2024-12-10',
    expiryDate: '2025-01-10',
    accessLevel: 'view'
  }
];

export const mockAccessRequests = [
  {
    id: 1,
    doctorId: 'DOC-001',
    doctorName: 'Dr. Smith',
    patientId: 1,
    patientName: 'John Doe',
    documentId: 'DOC-101',
    documentName: 'Vaccine Certificate - COVID-19',
    requestDate: '2024-12-10',
    status: 'pending',
    duration: '1 week',
    reason: 'Routine checkup and vaccination verification'
  }
];