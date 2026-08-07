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
  Chip,
  TextField,
  InputAdornment,
  Tooltip,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import VerifiedIcon from '@mui/icons-material/Verified';

export default function AuditLogsManager() {
  const [searchTerm, setSearchTerm] = useState('');

  const [logs, setLogs] = useState([
    {
      _id: 'LOG-9901',
      userName: 'Dr. Sarah Jenkins',
      userRole: 'doctor',
      action: 'CREATED',
      resource: 'MedicalRecord',
      ipAddress: '192.168.1.104',
      hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      transactionHash: '0x8f2a9d1b4c7e3f8a0b9c2d1e4f6a8b0c2d4e6f8a0b9c2d1e4f6a8b0c2d4e6f8a',
      timestamp: '2026-07-27 12:45:10',
    },
    {
      _id: 'LOG-9902',
      userName: 'Dr. Marcus Vance',
      userRole: 'doctor',
      action: 'VIEWED',
      resource: 'MedicalRecord',
      ipAddress: '192.168.1.108',
      hash: 'a7c9f8e0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8',
      transactionHash: '0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b',
      timestamp: '2026-07-27 12:50:33',
    },
    {
      _id: 'LOG-9903',
      userName: 'System Admin',
      userRole: 'admin',
      action: 'UPDATED',
      resource: 'InsuranceClaim',
      ipAddress: '10.0.0.12',
      hash: 'b8d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0',
      transactionHash: '0x9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c',
      timestamp: '2026-07-27 13:01:22',
    },
    {
      _id: 'LOG-9904',
      userName: 'John Doe',
      userRole: 'general_user',
      action: 'VIEWED',
      resource: 'LabReport',
      ipAddress: '172.16.0.45',
      hash: 'c9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0',
      transactionHash: '0x1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d',
      timestamp: '2026-07-27 13:04:15',
    },
  ]);

  const filtered = logs.filter(l => l.userName.toLowerCase().includes(searchTerm.toLowerCase()) || l.action.toLowerCase().includes(searchTerm.toLowerCase()) || l.resource.toLowerCase().includes(searchTerm.toLowerCase()));

  const getActionColor = (action) => {
    switch (action) {
      case 'CREATED': return 'success';
      case 'UPDATED': return 'primary';
      case 'DELETED': return 'error';
      case 'VIEWED': return 'info';
      default: return 'default';
    }
  };

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#0f172a' }}>
            System Audit Trail Logs
          </Typography>
          <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
            Real-time audit log recording User, Action (CREATED, UPDATED, DELETED, VIEWED), Timestamp, IP Address, Blockchain Transaction, and Hash
          </Typography>
        </Box>
      </Box>

      <Paper elevation={0} sx={{ p: 2, mb: 3, border: '1px solid #e2e8f0', borderRadius: '12px' }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Filter audit logs by user, action (CREATED, UPDATED, DELETED, VIEWED), or resource..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ color: '#94a3b8' }} />
              </InputAdornment>
            ),
          }}
        />
      </Paper>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: '12px' }}>
        <Table>
          <TableHead sx={{ bgcolor: '#f8fafc' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Log ID</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>User / Role</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Action</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Target Resource</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>IP Address</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Timestamp</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Data Hash</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Blockchain Tx</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map((log) => (
              <TableRow key={log._id} hover>
                <TableCell sx={{ fontWeight: 600, color: '#475569' }}>{log._id}</TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{log.userName}</Typography>
                  <Typography variant="caption" sx={{ color: '#64748b' }}>{log.userRole}</Typography>
                </TableCell>
                <TableCell>
                  <Chip label={log.action} size="small" color={getActionColor(log.action)} sx={{ fontWeight: 700 }} />
                </TableCell>
                <TableCell><Chip label={log.resource} size="small" variant="outlined" /></TableCell>
                <TableCell sx={{ fontFamily: 'monospace' }}>{log.ipAddress}</TableCell>
                <TableCell sx={{ fontSize: '0.85rem' }}>{log.timestamp}</TableCell>
                <TableCell>
                  <Tooltip title={log.hash}>
                    <Chip label={`${log.hash.substring(0, 10)}...`} size="small" sx={{ fontFamily: 'monospace', bgcolor: '#f1f5f9' }} />
                  </Tooltip>
                </TableCell>
                <TableCell>
                  <Chip icon={<VerifiedIcon />} label={`${log.transactionHash.substring(0, 10)}...`} size="small" color="success" sx={{ fontFamily: 'monospace' }} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
