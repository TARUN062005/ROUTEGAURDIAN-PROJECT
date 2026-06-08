const jwt = require('jsonwebtoken');
const { prisma } = require('./utils/dbConnector');

const BASE_URL = 'http://localhost:5000';
const JWT_SECRET = 'your_jwt_secret_here';

async function runTest() {
  let user;
  try {
    user = await prisma.user.findFirst();
    if (!user) {
      console.log('No user found, creating temporary mock user...');
      user = await prisma.user.create({
        data: {
          email: 'test' + Date.now() + '@example.com',
          name: 'Test User',
          passwordHash: 'mock',
          isActive: true
        }
      });
    }
    console.log('Using User:', user.email, 'ID:', user.id);
  } catch (err) {
    console.error('Failed to get user:', err);
    await prisma.$disconnect();
    return;
  }

  // Sign token
  const token = jwt.sign({ id: user.id, type: 'access' }, JWT_SECRET, { expiresIn: '1h' });

  let state = {
    origin: null,
    destination: null,
    mode: null,
    date: null,
    time: null,
    cargo: null,
    priority: null
  };
  let history = [];

  const headers = {
    'Content-Type': 'application/json',
    'x-xsrf-token': '1234567890',
    'Cookie': `XSRF-TOKEN=1234567890; access_token=${token}`
  };

  console.log('--- STEP 1: Sending Mode: "Sea (maritime)" ---');
  try {
    const res1 = await fetch(`${BASE_URL}/api/ai/agent/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message: 'Sea (maritime)', state, history })
    });
    const data1 = await res1.json();
    console.log('Response 1 Type:', data1.type);
    console.log('Response 1 Msg:', data1.message);
    console.log('Response 1 State:', data1.state);
    state = data1.state;
    history.push({ role: 'user', text: 'Sea (maritime)' });
    history.push({ role: 'ai', text: data1.message });
  } catch (err) {
    console.error('Err 1:', err);
  }

  console.log('\n--- STEP 2: Sending Origin: "Mumbai Port" ---');
  try {
    const res2 = await fetch(`${BASE_URL}/api/ai/agent/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message: 'Mumbai Port', state, history })
    });
    const data2 = await res2.json();
    console.log('Response 2 Type:', data2.type);
    console.log('Response 2 Msg:', data2.message);
    console.log('Response 2 State:', data2.state);
    state = data2.state;
    history.push({ role: 'user', text: 'Mumbai Port' });
    history.push({ role: 'ai', text: data2.message });
  } catch (err) {
    console.error('Err 2:', err);
  }

  console.log('\n--- STEP 3: Sending Destination: "Dubai" ---');
  try {
    const res3 = await fetch(`${BASE_URL}/api/ai/agent/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message: 'Dubai', state, history })
    });
    const data3 = await res3.json();
    console.log('Response 3 Type:', data3.type);
    console.log('Response 3 Msg:', data3.message);
    console.log('Response 3 Options:', data3.options);
    console.log('Response 3 State:', data3.state);
  } catch (err) {
    console.error('Err 3:', err);
  }

  await prisma.$disconnect();
}

runTest();
