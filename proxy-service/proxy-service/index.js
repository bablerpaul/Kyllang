require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { evaluatePartialReencryption } = require('./tpre-evaluator');
const { initBlockchain } = require('./blockchain');

const app = express();
app.use(cors());
app.use(express.json());

// Initialize blockchain connection on startup
initBlockchain();

app.post('/api/reencrypt', async (req, res) => {
    try {
        const { rkShare, encryptedPayload, vrfLookupToken, doctorAddress } = req.body;
        
        if (!rkShare || !encryptedPayload || !vrfLookupToken || !doctorAddress) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        const result = await evaluatePartialReencryption({
            rkShare,
            encryptedPayload,
            vrfLookupToken,
            doctorAddress
        });

        res.json(result);
    } catch (error) {
        console.error('[ProxyNode] Re-encryption error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`[ProxyNode] Service running on port ${PORT}`);
});
