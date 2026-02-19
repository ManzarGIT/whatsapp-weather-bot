/**
 * Test script — simulates WhatsApp webhook payloads locally.
 * Run: node tests/test.js
 * Make sure your .env is configured first.
 */

require('dotenv').config();
const axios = require('axios');

const BASE_URL = `http://localhost:${process.env.PORT || 3000}`;

function makeTextPayload(from, text) {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      changes: [{
        value: {
          metadata: { phone_number_id: process.env.WHATSAPP_PHONE_ID || 'TEST_PHONE_ID' },
          messages: [{
            from,
            type: 'text',
            text: { body: text },
            id: `msg_${Date.now()}`,
          }],
        },
      }],
    }],
  };
}

function makeLocationPayload(from, lat, lon) {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      changes: [{
        value: {
          metadata: { phone_number_id: process.env.WHATSAPP_PHONE_ID || 'TEST_PHONE_ID' },
          messages: [{
            from,
            type: 'location',
            location: { latitude: lat, longitude: lon },
            id: `msg_${Date.now()}`,
          }],
        },
      }],
    }],
  };
}

async function runTests() {
  console.log('🧪 WhatsApp Weather Bot — Local Test Suite\n');

  const tests = [
    { name: 'Health check', fn: async () => {
        const { data } = await axios.get(`${BASE_URL}/`);
        console.log('✅ Health:', data);
      }
    },
    { name: 'Webhook verification', fn: async () => {
        const { data } = await axios.get(`${BASE_URL}/webhook`, {
          params: {
            'hub.mode': 'subscribe',
            'hub.verify_token': process.env.VERIFY_TOKEN,
            'hub.challenge': 'test_challenge_123',
          },
        });
        console.log('✅ Verification response:', data);
      }
    },
    { name: 'City weather — London', fn: async () => {
        const { data } = await axios.post(`${BASE_URL}/webhook`, makeTextPayload('15551234567', 'London'));
        console.log('✅ London weather triggered:', data);
      }
    },
    { name: 'City weather — New York', fn: async () => {
        const { data } = await axios.post(`${BASE_URL}/webhook`, makeTextPayload('15559876543', 'New York'));
        console.log('✅ New York weather triggered:', data);
      }
    },
    { name: 'GPS location — Tokyo', fn: async () => {
        const { data } = await axios.post(`${BASE_URL}/webhook`, makeLocationPayload('15551234567', 35.6762, 139.6503));
        console.log('✅ GPS location triggered:', data);
      }
    },
    { name: 'Help command', fn: async () => {
        const { data } = await axios.post(`${BASE_URL}/webhook`, makeTextPayload('15551234567', 'help'));
        console.log('✅ Help triggered:', data);
      }
    },
    { name: 'Invalid city', fn: async () => {
        const { data } = await axios.post(`${BASE_URL}/webhook`, makeTextPayload('15551234567', 'xyzinvalidcity99999'));
        console.log('✅ Invalid city handled:', data);
      }
    },
  ];

  for (const test of tests) {
    try {
      process.stdout.write(`Running: ${test.name} ... `);
      await test.fn();
    } catch (err) {
      console.log(`❌ FAILED: ${err.response?.data?.error || err.message}`);
    }
    await new Promise(r => setTimeout(r, 500)); // small delay between tests
  }

  console.log('\n✅ All tests complete. Check your bot logs for outbound message attempts.');
  console.log('Note: Actual WhatsApp messages only send with valid WHATSAPP_TOKEN + phone.');
}

runTests();
