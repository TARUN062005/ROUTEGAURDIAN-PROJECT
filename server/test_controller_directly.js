const { agentChat } = require('./controller/aiAgentController');

const req = {
  body: {
    message: 'Sea (maritime)',
    state: {
      origin: null,
      destination: null,
      mode: null,
      date: null,
      time: null,
      cargo: null,
      priority: null
    },
    history: []
  }
};

const res = {
  json: function(data) {
    console.log('JSON Output State:', data.state);
    console.log('JSON Output Message:', data.message);
  },
  status: function(code) {
    console.log('Status Code:', code);
    return this;
  }
};

agentChat(req, res).catch(console.error);
