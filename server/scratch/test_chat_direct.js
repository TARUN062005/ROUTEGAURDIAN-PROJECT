const dotenv = require('dotenv');
const path = require('path');

// Load env variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const { ConnectDb } = require('../utils/dbConnector');
const aiAgentController = require('../controller/aiAgentController');

async function testDirectChat() {
  try {
    console.log('Connecting to DB...');
    await ConnectDb();
    
    const req = {
      body: {
        message: 'sea',
        state: {
          origin: null,
          destination: null,
          mode: null,
          date: null,
          time: null,
          cargo: null,
          priority: null,
          confirmedSource: null,
          confirmedDest: null
        },
        history: []
      }
    };
    
    const res = {
      status: function(code) {
        console.log('HTTP STATUS:', code);
        return this;
      },
      json: function(data) {
        console.log('HTTP RESPONSE:', JSON.stringify(data, null, 2));
      }
    };
    
    console.log('Invoking agentChat with message "sea"...');
    await aiAgentController.agentChat(req, res);
    console.log('Done.');
  } catch (err) {
    console.error('CRASH DETECTED:', err);
  }
}

testDirectChat();
