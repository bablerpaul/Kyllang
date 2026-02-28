import React from 'react';
import { Box, Typography, Divider, Grid } from '@mui/material';

const DocumentRenderer = ({ documentData, parsedContent }) => {
    // Attempt to beautifully map arbitrary JSON keys to readable labels
    const renderDataFields = () => {
        let contentObj = {};
        if (typeof parsedContent === 'string') {
            try {
                contentObj = JSON.parse(parsedContent);
            } catch (e) {
                // Not JSON, just return plain text
                return (
                    <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', mt: 2 }}>
                        {parsedContent}
                    </Typography>
                );
            }
        } else {
            contentObj = parsedContent;
        }

        if (!contentObj || Object.keys(contentObj).length === 0) {
            return <Typography color="text.secondary">No detailed information provided.</Typography>;
        }

        return (
            <Grid container spacing={3} sx={{ mt: 1 }}>
                {Object.entries(contentObj).map(([key, value]) => {
                    // Skip technical IDs
                    if (key === 'patientId' || key === 'doctorId' || key === '_id') return null;

                    // Format Key (camelCase to Title Case)
                    const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());

                    // Format Value
                    let displayValue = value;
                    if (Array.isArray(value)) {
                        displayValue = value.join(', ');
                    } else if (typeof value === 'object' && value !== null) {
                        displayValue = JSON.stringify(value);
                    } else if (typeof value === 'boolean') {
                        displayValue = value ? 'Yes' : 'No';
                    } else if (!value && value !== 0) {
                        displayValue = 'N/A';
                    }

                    return (
                        <Grid item xs={12} sm={6} key={key}>
                            <Box sx={{ p: 2, bgcolor: '#f8f9fa', borderRadius: 1, height: '100%' }}>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                    {label}
                                </Typography>
                                <Typography variant="body1">
                                    {displayValue}
                                </Typography>
                            </Box>
                        </Grid>
                    );
                })}
            </Grid>
        );
    };

    return (
        <Box sx={{ p: 4, bgcolor: 'white', color: 'black' }}>
            {/* Header Section */}
            <Box sx={{ textAlign: 'center', mb: 4 }}>
                <Typography variant="h4" sx={{ color: '#1976d2', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 }}>
                    {documentData?.type ? documentData.type.replace('_', ' ') : 'MEDICAL RECORD'}
                </Typography>
                <Typography variant="subtitle1" color="text.secondary" sx={{ mt: 1 }}>
                    {documentData?.title || 'Official Health Document'}
                </Typography>
            </Box>

            <Divider sx={{ mb: 4, borderColor: '#e0e0e0' }} />

            {/* Core Details */}
            <Grid container spacing={2} sx={{ mb: 4 }}>
                {documentData?.patientName && (
                    <Grid item xs={6}>
                        <Typography variant="caption" color="text.secondary" display="block">Patient</Typography>
                        <Typography variant="body1" sx={{ fontWeight: 'bold' }}>
                            {documentData.patientName}
                        </Typography>
                    </Grid>
                )}
                <Grid item xs={documentData?.patientName ? 6 : 12} sx={{ textAlign: documentData?.patientName ? 'right' : 'left' }}>
                    <Typography variant="caption" color="text.secondary" display="block">Record Date</Typography>
                    <Typography variant="body1" sx={{ fontWeight: 'bold' }}>
                        {documentData?.createdAt ? new Date(documentData.createdAt).toLocaleDateString() : (documentData?.issueDate || 'N/A')}
                    </Typography>
                </Grid>
            </Grid>

            {/* Dynamic Content */}
            <Box sx={{ minHeight: '300px' }}>
                <Typography variant="h6" sx={{ borderBottom: '2px solid #1976d2', pb: 1, display: 'inline-block', mb: 2 }}>
                    Clinical Details
                </Typography>
                {renderDataFields()}
            </Box>

        </Box>
    );
};

export default DocumentRenderer;
