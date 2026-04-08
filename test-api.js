const baseUrl = 'http://localhost:3001/api/auth';
const email = 'testuser_' + Date.now() + '@example.com';
const password = 'mySecretPassword123!';

(async () => {
    // 1. Register
    console.log('--- 測試註冊 ---');
    const regRes = await fetch(`${baseUrl}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });
    console.log('HTTP Status:', regRes.status);
    console.log('Response:', await regRes.json());
    
    // 2. Login
    console.log('\n--- 測試登入 ---');
    const logRes = await fetch(`${baseUrl}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });
    console.log('HTTP Status:', logRes.status);
    console.log('Response:', await logRes.json());
})();
