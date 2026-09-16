const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const RPC_URL = 'http://127.0.0.1:7545';
const CONTRACT_ADDRESS = '0x8fdF2F9C08185A9bE5FC6aE64263e660FBf21656'; // EMRRegistry

const outputDir = 'C:\\Users\\Karthik\\.gemini\\antigravity-ide\\brain\\a8c469b3-ccd6-4769-8f79-33bd380b63dc\\journal_artifacts\\raw_data';
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

// ABI for EMRRegistry
const abi = [
    "function commitHash(bytes32 commitment) external",
    "function revealHash(string _patientId, string _recordType, string _dataHash, string _ipfsCid, bytes32 nonce) external",
    "function verifyRecordHash(string _dataHash) public view returns (bool, uint256, string, string, string, address)",
    "function storeHash(string _batchHash) public"
];

let iface;
if (ethers.Interface) {
    iface = new ethers.Interface(abi);
} else {
    iface = new ethers.utils.Interface(abi);
}

async function extractTransactions() {
    console.log(`Connecting to ${RPC_URL}...`);
    let provider;
    if (ethers.JsonRpcProvider) {
        provider = new ethers.JsonRpcProvider(RPC_URL);
    } else {
        provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    }

    let currentBlock;
    try {
        currentBlock = await provider.getBlockNumber();
    } catch (e) {
        console.error("Failed to connect to Ganache:", e.message);
        process.exit(1);
    }
    console.log(`Current Block: ${currentBlock}`);

    const transactions = [];

    // Assuming we scan all blocks for local testing
    for (let i = 0; i <= currentBlock; i++) {
        const block = await (provider.getBlockWithTransactions ? provider.getBlockWithTransactions(i) : provider.getBlock(i, true));
        const txs = block.prefetchedTransactions || block.transactions;
        
        if (block && txs) {
            for (const tx of txs) {
                if (tx.to && tx.to.toLowerCase() === CONTRACT_ADDRESS.toLowerCase()) {
                    let functionName = 'Unknown';
                    let functionSelector = '0x' + tx.data.substring(2, 10);
                    let params = '';
                    let decoded;

                    try {
                        decoded = iface.parseTransaction({ data: tx.data, value: tx.value });
                        if (decoded) {
                            functionName = decoded.name;
                            params = JSON.stringify(decoded.args.map(a => (a && typeof a.toString === 'function') ? a.toString() : a));
                        }
                    } catch (e) {
                        // ignore parsing error for other functions not in our abi subset
                    }

                    const receipt = await provider.getTransactionReceipt(tx.hash);

                    const gasLimit = (tx.gasLimit || 0).toString();
                    const gasUsed = receipt ? (receipt.gasUsed || 0).toString() : '0';
                    const gasPrice = tx.gasPrice ? tx.gasPrice.toString() : '0';
                    
                    let txFee = '0';
                    try {
                         if (ethers.toBigInt) {
                             txFee = (ethers.toBigInt(gasUsed) * ethers.toBigInt(gasPrice)).toString();
                         } else {
                             txFee = (ethers.BigNumber.from(gasUsed).mul(ethers.BigNumber.from(gasPrice))).toString();
                         }
                    } catch (e) {}
                    
                    const calldataSize = (tx.data.length - 2) / 2;

                    transactions.push({
                        TransactionIndex: tx.index || 0,
                        TransactionHash: tx.hash,
                        BlockNumber: tx.blockNumber || block.number,
                        Timestamp: block.timestamp,
                        From: tx.from,
                        To: tx.to,
                        Function: functionName,
                        Selector: functionSelector,
                        GasLimit: gasLimit,
                        GasUsed: gasUsed,
                        GasPrice: gasPrice,
                        TxFee: txFee,
                        CalldataSize: calldataSize,
                        Params: params,
                        Status: receipt ? receipt.status : 0
                    });
                }
            }
        }
    }

    const csvHeader = 'TransactionIndex,TransactionHash,BlockNumber,Timestamp,From,To,Function,Selector,GasLimit,GasUsed,GasPrice,TxFee,CalldataSize,Params,Status\n';
    const csvRows = transactions.map(t => {
        // Escape params for CSV
        const escapedParams = `"${t.Params.replace(/"/g, '""')}"`;
        return `${t.TransactionIndex},${t.TransactionHash},${t.BlockNumber},${t.Timestamp},${t.From},${t.To},${t.Function},${t.Selector},${t.GasLimit},${t.GasUsed},${t.GasPrice},${t.TxFee},${t.CalldataSize},${escapedParams},${t.Status}`;
    }).join('\n');

    const filePath = path.join(outputDir, 'transactions.csv');
    fs.writeFileSync(filePath, csvHeader + csvRows);
    console.log(`Extracted ${transactions.length} transactions to ${filePath}`);
}

extractTransactions().catch(console.error);
