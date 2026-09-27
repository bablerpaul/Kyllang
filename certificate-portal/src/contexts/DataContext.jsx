import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../utils/api';
import { useAuth } from './AuthContext';

const DataContext = createContext();

export const DataProvider = ({ children }) => {
  const { role, isAuthenticated } = useAuth();

  const [patients, setPatients] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [certificates, setCertificates] = useState([]);
  const [systemStats, setSystemStats] = useState({
    totalUsers: 0,
    totalDoctors: 0,
    totalCertificates: 0,
    activeHospitals: 0
  });

  const fetchData = useCallback(async () => {
    if (!isAuthenticated) return;

    try {
      if (role === 'hospital_admin') {
        const users = await apiFetch('/api/admin/users');
        const userArray = users?.data || users || [];
        setPatients(userArray.filter(u => u.role === 'general_user'));
        setDoctors(userArray.filter(u => u.role === 'doctor'));
        setAdmins(userArray.filter(u => u.role === 'hospital_admin')); // We might not get admins from this route right now, but we can filter safely

        const stats = await apiFetch('/api/admin/analytics');
        setSystemStats(stats);
      }

      if (role === 'doctor') {
        const myPatients = await apiFetch('/api/doctor/patients');
        setPatients(myPatients);

        const myCerts = await apiFetch('/api/certificates');
        setCertificates(myCerts);
      }

      if (role === 'general_user') {
        const myCerts = await apiFetch('/api/certificates');
        setCertificates(myCerts);
      }
    } catch (error) {
      console.error('Error fetching data from backend', error);
    }
  }, [role, isAuthenticated]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // User CRUD operations via Auth Route (Registering creates them)
  const addPatient = async (patientData) => {
    console.warn("Legacy addPatient method called. Please use UserManagement UI.");
  };

  const updatePatient = (id, patientData) => {
    // Stub
  };

  const deletePatient = (id) => {
    // Stub
  };

  const addDoctor = async (doctorData) => {
    console.warn("Legacy addDoctor method called. Please use UserManagement UI.");
  };

  const updateDoctor = (id, doctorData) => {
    // Stub
  };

  const deleteDoctor = (id) => {
    // Stub
  };

  const assignDoctorToPatient = (patientId, doctorId) => {
    // Stub
  };

  const removeDoctorFromPatient = (patientId, doctorId) => {
    // Stub
  };

  // Certificate operations
  const addDocumentToPatient = async (patientId, documentData) => {
    try {
      await apiFetch('/api/certificates', {
        method: 'POST',
        body: JSON.stringify({
          patientId,
          diagnosis: documentData.name || 'Checkup',
          remarks: documentData.type || '',
          validFrom: new Date(),
          validUntil: new Date(new Date().setFullYear(new Date().getFullYear() + 1))
        })
      });
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const deleteDocumentFromPatient = (patientId, documentId) => {
    // Stub
  };

  const getPatientsByDoctor = (doctorId) => {
    return patients; // For now backend returns only assigned patients for doctor
  };

  const getDoctorById = (doctorId) => {
    return doctors.find(doctor => doctor._id === doctorId);
  };

  const getPatientById = (patientId) => {
    return patients.find(patient => patient._id === patientId);
  };

  const addAdmin = async (adminData) => {
    console.warn("Legacy addAdmin method called. Please use UserManagement UI.");
  };

  const deleteAdmin = (id) => {
    // Stub
  };

  const value = {
    patients,
    doctors,
    admins,
    certificates,
    systemStats,
    fetchData,

    // Patient operations
    addPatient,
    updatePatient,
    deletePatient,
    getPatientById,

    // Doctor operations
    addDoctor,
    updateDoctor,
    deleteDoctor,
    getDoctorById,
    getPatientsByDoctor,

    // Assignment operations
    assignDoctorToPatient,
    removeDoctorFromPatient,

    // Document operations
    addDocumentToPatient,
    deleteDocumentFromPatient,

    // Admin operations
    addAdmin,
    deleteAdmin
  };

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within DataProvider');
  }
  return context;
};