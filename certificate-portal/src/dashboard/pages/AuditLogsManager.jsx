import React, { useState, useEffect } from 'react';
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
import { apiFetch } from '../../utils/api';

export default function AuditLogsManager() {
  const [searchTerm, setSearchTerm] = useState('');

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await apiFetch('/api/admin/audit-logs');
        const logsData = Array.isArray(res) ? res : (res?.data || []);
        
        // Map backend data to frontend expected format
        const formattedLogs = logsData.map(log => {
          const uName = log.actor?.name || log.user?.name || 'System';
          const uRole = log.actor?.role || log.user?.role || 'system';
          const resourceType = log.details?.resource || Object.keys(log.details || {})[0] || 'System';
          const dataHash = log.hash || log.blockchainHash || 'N/A';
          const txHash = log.transactionHash || log.blockchainTransaction || 'N/A';
          
          return {
            _id: log._id,
            userName: uName,
            userRole: uRole,
            action: log.action || 'UNKNOWN',
            resource: resourceType,
            ipAddress: log.ipAddress || 'Unknown',
            hash: dataHash,
            transactionHash: txHash,
            timestamp: new Date(log.timestamp).toLocaleString(),
          };
        });
        
        setLogs(formattedLogs);
      } catch (err) {
        console.error('Failed to fetch audit logs', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchLogs();
  }, []);

  const filtered = logs.filter(l => 
    l.userName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    l.action.toLowerCase().includes(searchTerm.toLowerCase()) || 
    l.resource.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
