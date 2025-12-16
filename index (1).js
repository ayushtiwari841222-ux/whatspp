const express = require('express');
const fs = require('fs');
const path = require('path');
const formidable = require('formidable');
const moment = require('moment-timezone');
const { Boom } = require('@hapi/boom');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} = require('@whiskeysockets/baileys');

const app = express();
const PORT = process.env.PORT || 3006;
const sessionFolder = path.join(__dirname, 'session');

if (!fs.existsSync(sessionFolder)) fs.mkdirSync(sessionFolder);

app.use(express.json());
app.use(express.static('public'));

let globalSocket = null;
let isReady = false;
let isLooping = false;
let currentLoop = null;
let messageLogs = [];
let lastMessages = {
  receivers: [],
  lines: [],
  delaySec: 2
};

let sendMessages = async () => {};

/* ================= SOCKET ================= */

async function startSocket() {
  if (globalSocket) return;

  const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    browser: ['PairCode Server', 'Chrome', '1.0'],
    printQRInTerminal: false
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'open') {
      isReady = true;
      console.log('✅ WhatsApp Connected');
    }

    if (connection === 'close') {
      isReady = false;
      globalSocket = null;

      const code = new Boom(lastDisconnect?.error)?.output?.statusCode;
      console.log('❌ Disconnected:', code);

      if (code !== DisconnectReason.loggedOut) {
        setTimeout(startSocket, 3000);
      }
    }
  });

  globalSocket = sock;
}

startSocket();

/* ================= PAIR CODE API ================= */

// ✅ FIXED: socket ready hone ka wait karega
app.post('/api/pair', async (req, res) => {
  try {
    const number = (req.body.number || '').replace(/\D/g, '');
    if (!number)
      return res.status(400).json({ error: 'Phone number required' });

    // 🔁 WAIT for socket (max 20 sec)
    let waited = 0;
    while ((!globalSocket || !isReady) && waited < 20) {
      await new Promise(r => setTimeout(r, 1000));
      waited++;
    }

    if (!globalSocket || !isReady)
      return res.status(400).json({
        error: 'WhatsApp not ready yet. Wait 10–15 sec and try again.'
      });

    const code = await globalSocket.requestPairingCode(number);
    res.json({ pairCode: code });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================= MESSAGE APIs ================= */

// Start Loop
app.post('/api/start', (req, res) => {
  if (isLooping) return res.status(400).json({ error: 'Already running' });

  const form = new formidable.IncomingForm();

  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(500).json({ error: 'Form error' });

    const name = (fields.name || '').toString().trim();
    const delaySec = parseInt(fields.delay) || 2;
    const rawReceivers = (fields.receiver || '').toString().trim();

    if (!rawReceivers) return res.status(400).json({ error: 'Receivers required' });
    if (!files.file) return res.status(400).json({ error: 'File required' });

    const receivers = rawReceivers
      .split(',')
      .map(r => r.trim())
      .filter(r => /^\d{10,15}$/.test(r) || r.endsWith('@g.us'))
      .map(r => r.endsWith('@g.us') ? r : r + '@s.whatsapp.net');

    const file = Array.isArray(files.file) ? files.file[0] : files.file;
    const lines = fs.readFileSync(file.filepath, 'utf-8')
      .split('\n')
      .map(l => `${name} ${l.replace(/{name}/gi, '')}`.trim())
      .filter(Boolean);

    if (!globalSocket || !isReady)
      return res.status(400).json({ error: 'WhatsApp not connected' });

    isLooping = true;
    lastMessages = { receivers, lines, delaySec };
    messageLogs = [];

    sendMessages = async () => {
      while (isLooping) {
        for (const line of lines) {
          for (const jid of receivers) {
            if (!isLooping) break;
            try {
              await globalSocket.sendMessage(jid, { text: line });
              messageLogs.push(
                `[${moment().format('HH:mm:ss')}] ✅ ${jid}`
              );
            } catch {
              messageLogs.push(
                `[${moment().format('HH:mm:ss')}] ❌ ${jid}`
              );
            }
            await new Promise(r => setTimeout(r, delaySec * 1000));
          }
        }
      }
    };

    currentLoop = sendMessages();
    res.json({ message: 'Started' });
  });
});

// Stop
app.post('/api/stop', (_, res) => {
  isLooping = false;
  currentLoop = null;
  res.json({ message: 'Stopped' });
});

// Logs
app.get('/api/logs', (_, res) => {
  res.json({ logs: messageLogs });
});

// Status
app.get('/api/status', (_, res) => {
  res.json({
    isConnected: isReady,
    isLooping
  });
});

/* ================= SERVER ================= */

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});    const delaySec = parseInt(fields.delay) || 2;
    const rawReceivers = (fields.receiver || '').toString().trim();

    if (!rawReceivers) return res.status(400).json({ error: 'Receivers required' });
    if (!files.file) return res.status(400).json({ error: 'File required' });

    const receivers = rawReceivers
      .split(',')
      .map(r => r.trim())
      .filter(r => /^\d{10,15}$/.test(r) || r.endsWith('@g.us'))
      .map(r => r.endsWith('@g.us') ? r : r + '@s.whatsapp.net');

    const file = Array.isArray(files.file) ? files.file[0] : files.file;
    const lines = fs.readFileSync(file.filepath, 'utf-8')
      .split('\n')
      .map(l => `${name} ${l.replace(/{name}/gi, '')}`.trim())
      .filter(Boolean);

    if (!globalSocket || !isReady)
      return res.status(400).json({ error: 'WhatsApp not connected' });

    isLooping = true;
    lastMessages = { receivers, lines, delaySec };
    messageLogs = [];

    sendMessages = async () => {
      while (isLooping) {
        for (const line of lines) {
          for (const jid of receivers) {
            if (!isLooping) break;
            try {
              await globalSocket.sendMessage(jid, { text: line });
              messageLogs.push(
                `[${moment().format('HH:mm:ss')}] ✅ ${jid}`
              );
            } catch {
              messageLogs.push(
                `[${moment().format('HH:mm:ss')}] ❌ ${jid}`
              );
            }
            await new Promise(r => setTimeout(r, delaySec * 1000));
          }
        }
      }
    };

    currentLoop = sendMessages();
    res.json({ message: 'Started' });
  });
});

// Stop
app.post('/api/stop', (_, res) => {
  isLooping = false;
  currentLoop = null;
  res.json({ message: 'Stopped' });
});

// Logs
app.get('/api/logs', (_, res) => {
  res.json({ logs: messageLogs });
});

// Status
app.get('/api/status', (_, res) => {
  res.json({
    isConnected: isReady,
    isLooping
  });
});

/* ================= SERVER ================= */

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
