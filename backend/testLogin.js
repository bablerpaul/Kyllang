const axios = require('axios');

async function testLogin() {
    try {
        const response = await axios.post('http://localhost:5000/api/auth/login', {
            email: 'admin@hospital.com',
            password: 'password123'
        });
        console.log("Success:", response.data);
    } catch (error) {
        if (error.response) {
            console.error("Error Response Data:", error.response.data);
        } else {
            console.error("Error Message:", error.message);
        }
    }
}
testLogin();
