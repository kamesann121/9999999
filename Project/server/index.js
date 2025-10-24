const path = require('path');
const fs = require('fs');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');
const _ = require('lodash');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');

fs.mkdirSync(DATA_DIR, { recursive: true });

const adapter = new JSONFile(DB_PATH);
const db = new Low(adapter, {});

const app = express();
app.use(express.static(path.join(__dirname, '..', 'public')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const clients = new Map();

(async () => {
  await db.read();
  db.data ||= {
    players: [],
    chat: [],
    shop: [
      { id: 'cheapUp', name: 'タップ力 +1', price: 10, type: 'tap', value: 1 },
      { id: 'midUp', name: 'タップ力 +5', price: 45, type: 'tap', value: 5 },
      { id: 'auto1', name: '自動収入 +1/s', price: 30, type: 'auto', value: 1 },
      { id: 'auto5', name: '自動収入 +5/s', price: 130, type: 'auto', value: 5 }
    ]
  };
  await db.write();

  wss.on('connection', (ws) => {
    clients.set(ws, null);

    const ranks = _.orderBy(db.data.players, ['taps'], ['desc']).slice(0, 100);
    const chats = Array.isArray(db.data.chat) ? db.data.chat.slice(-100) : [];
    ws.send(JSON.stringify({ type: 'init', shop: db.data.shop, ranks, chats }));

    ws.on('message', async (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      await db.read();
      db.data ||= { players: [], chat: [], shop: [] };

      // 匿名ユーザーを使う
      const nickname = '匿名';

      let user = clients.get(ws);
      if (!user) {
        user = { nickname, coins: 0, tapValue: 1, auto: 0, taps: 0 };
        clients.set(ws, user);
        db.data.players.push(user);
      }

      if (msg.type === 'tap') {
        user.coins += user.tapValue;
        user.taps += 1;
        await db.write();
        ws.send(JSON.stringify({ type: 'tap', nickname, coins: user.coins, taps: user.taps, tap_value: user.tapValue }));
        return;
      }

      if (msg.type === 'buy') {
        const item = db.data.shop.find(i => i.id === msg.itemId);
        if (!item || user.coins < item.price) {
          ws.send(JSON.stringify({ type: 'buyResult', ok: false }));
          return;
        }

        user.coins -= item.price;
        if (item.type === 'tap') user.tapValue += item.value;
        if (item.type === 'auto') user.auto += item.value;
        await db.write();
        ws.send(JSON.stringify({ type: 'buyResult', ok: true }));
        return;
      }

      if (msg.type === 'chat') {
        const text = msg.text.trim();
        if (!text) return;

        const entry = { nickname, icon: null, text, ts: Date.now() };
        db.data.chat.push(entry);
        await db.write();
        broadcast({ type: 'chat', ...entry });
        return;
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
    });
  });

  setInterval(async () => {
    try {
      await db.read();
      db.data ||= { players: [] };
      for (const user of db.data.players) {
        if (user.auto > 0) user.coins += user.auto;
      }
      await db.write();
    } catch (err) {
      console.error('Error in auto income interval:', err);
    }
  }, 1000);

  function broadcast(obj) {
    const str = JSON.stringify(obj);
    for (const ws of wss.clients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(str);
    }
  }

  server.listen(PORT, () => console.log('Server running on', PORT));
})();
