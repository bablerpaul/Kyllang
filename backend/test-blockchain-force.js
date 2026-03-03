async function test() {
    try {
        const loginRes = await fetch('http://localhost:5000/api/auth/login', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'admin@hospital.com', password: 'password123' })
        });
        const token = (await loginRes.json()).token;

        const usersRes = await fetch('http://localhost:5000/api/admin/users', { headers: { 'Authorization': `Bearer ${token}` } });
        const usersData = await usersRes.json();
        const doctor = usersData.find(u => u.role === 'doctor');
        const patient = usersData.find(u => u.role === 'general_user');

        // FORCE AUDIT LOG BY CREATING A NEW FAKE USER
        const newUserRes = await fetch('http://localhost:5000/api/admin/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
                name: `Test Patient ${Date.now()}`,
                email: `test${Date.now()}@example.com`,
                password: 'password123',
                role: 'general_user'
            })
        });
        const newUserData = await newUserRes.json();
        console.log('Created new user to force an audit log:', newUserData.message);

        // TRIGGER BLOCKCHAIN ANCHOR
        const anchorRes = await fetch('http://localhost:5000/api/admin/anchor-logs', {
            method: 'POST', headers: { 'Authorization': `Bearer ${token}` }
        });
        const anchorData = await anchorRes.json();
        console.log('--- BLOCKCHAIN ANCHOR RESULT ---');
        console.log(anchorData);

    } catch (error) { console.error('Error:', error); }
}
test();
