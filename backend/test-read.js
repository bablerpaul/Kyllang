const { ethers } = require("ethers");

async function checkGanacheState() {
    console.log("Checking Ganache state for contract 0xaB911356662367A0b600afCf28CA4CA6aA5Ed682...\n");

    try {
        const provider = new ethers.JsonRpcProvider("HTTP://127.0.0.1:7545");

        // Check if the blockchain is running
        const blockNumber = await provider.getBlockNumber();
        console.log("Ganache is running. Current Block Number:", blockNumber);

        // Check if the contract actually exists at that address
        const code = await provider.getCode("0xaB911356662367A0b600afCf28CA4CA6aA5Ed682");

        if (code === "0x") {
            console.log("\n❌ CRITICAL ISSUE DETECTED ❌");
            console.log("There is NO smart contract deployed at address 0xaB911356662367A0b600afCf28CA4CA6aA5Ed682!");
            console.log("This almost always means you closed and restarted Ganache.");
            console.log("Ganache wipes its memory clean every time it is restarted.\n");
        } else {
            console.log("\n✅ Contract code found at address 0xaB911356662367A0b600afCf28CA4CA6aA5Ed682!");

            // Try reading the data
            const abi = ["function anchors(uint256) view returns (string, uint256)", "function getTotalAnchors() view returns (uint256)"];
            const contract = new ethers.Contract("0xaB911356662367A0b600afCf28CA4CA6aA5Ed682", abi, provider);

            try {
                // Just calling this to see if it reverts
                await contract.anchors(0);
                console.log("✅ Data successfully read from index 0!");
            } catch (e) {
                console.log("❌ Failed to read data at index 0.");
                console.log("Error details:", e.message);
            }
        }
    } catch (e) {
        console.log("Could not connect to Ganache:", e.message);
    }
}

checkGanacheState();
