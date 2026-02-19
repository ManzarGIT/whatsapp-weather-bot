const NodeCache = require('node-cache');

// Sessions expire after 30 minutes of inactivity
const SESSION_TTL = 30 * 60;

const store = new NodeCache({ stdTTL: SESSION_TTL, useClones: false });

const sessionStore = {
  get: (userId) => store.get(userId) || null,

  set: (userId, data) => {
    const existing = store.get(userId) || {};
    store.set(userId, { ...existing, ...data });
  },

  clear: (userId) => store.del(userId),
};

module.exports = { sessionStore };
