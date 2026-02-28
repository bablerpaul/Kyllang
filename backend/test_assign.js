async function test() {
    try {
        // Login as admin
        const loginRes = await fetch('http://localhost:5000/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'admin@hospital.com',
                password: 'password123'
            })
        });
        const loginData = await loginRes.json();
        const token = loginData.token;
        console.log('Login successful. Token:', token.substring(0, 10) + '...');

        // Get users to find a doctor and a patient
        const usersRes = await fetch('http://localhost:5000/api/admin/users', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const usersData = await usersRes.json();

        const doctor = usersData.find(u => u.role === 'doctor');
        const patient = usersData.find(u => u.role === 'general_user');

        console.log('Found Doctor:', doctor._id, doctor.name);
        console.log('Found Patient:', patient._id, patient.name);

        // Try to assign
        const assignRes = await fetch('http://localhost:5000/api/admin/assign', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                doctorId: doctor._id,
                patientId: patient._id
            })
        });

        const assignData = await assignRes.json();

        if (!assignRes.ok) {
            console.error('Assign Failed:', assignRes.status, assignData);
        } else {
            console.log('Assign Success Result:', assignData);
        }
    } catch (error) {
        console.error('Request Failed:', error.message);
    }
}

test();
