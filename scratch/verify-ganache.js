const { ethers } = require("ethers");
require("dotenv").config({ path: "../backend/.env" });

async function verify() {
  const rpcUrl = process.env.RPC_URL || "http://127.0.0.1:7545";
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  
  try {
    const network = await provider.getNetwork();
    const blockNumber = await provider.getBlockNumber();
    
    // Custom RPC calls to get raw strings
    const chainIdHex = await provider.send("eth_chainId", []);
    const netVersion = await provider.send("net_version", []);
    const clientVersion = await provider.send("web3_clientVersion", []);

    console.log("=== GANACHE RPC STATUS ===");
    console.log("RPC Reachable: YES");
    console.log(`eth_chainId: ${parseInt(chainIdHex, 16)} (${chainIdHex})`);
    console.log(`net_version: ${netVersion}`);
    console.log(`latest block: ${blockNumber}`);
    console.log(`client version: ${clientVersion}`);

    const privateKey = process.env.PRIVATE_KEY;
    if (privateKey) {
      const wallet = new ethers.Wallet(privateKey, provider);
      const address = wallet.address;
      const balance = await provider.getBalance(address);
      console.log("\n=== DEPLOYMENT ACCOUNT STATUS ===");
      console.log(`Address: ${address}`);
      console.log(`Balance: ${ethers.formatEther(balance)} ETH`);
      
      if (balance > 0n) {
        console.log("Status: Account is funded.");
      } else {
        console.log("Status: Account is NOT funded. Deployment account needs manual import/funding in Ganache.");
      }
    } else {
      console.log("No PRIVATE_KEY found in .env");
    }

  } catch (error) {
    console.error("=== GANACHE RPC STATUS ===");
    console.error("RPC Reachable: NO");
    console.error(error.message);
  }
}

verify();
