const axios = require('axios');
const { exec } = require('child_process');

async function testSwagger() {
    console.log("=== SWAGGER TEST ===");
    
    // PROD MODE
    const envProd = Object.assign({}, process.env, { NODE_ENV: 'production', TEST_MODE: 'false' });
    const serverProd = exec('node index.js', { env: envProd });
    
    // Give server time to start
    await new Promise(r => setTimeout(r, 2000));
    
    try {
        const res = await axios.get('http://localhost:5000/api/docs/');
        console.log("PROD Mode Status:", res.status);
    } catch(e) {
        console.log("PROD Mode Error Status:", e.response?.status);
        console.log("PROD Mode Error Body:", e.response?.data);
    }
    
    try {
        const res2 = await axios.get('http://localhost:5000/api/docs');
        console.log("PROD Mode Status (no slash):", res2.status);
    } catch(e) {
        console.log("PROD Mode Error Status (no slash):", e.response?.status);
    }

    serverProd.kill();
    process.exit(0);
}

testSwagger();
