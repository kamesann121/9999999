const WS_URL = location.hostname.includes('localhost')
  ? 'ws://localhost:3000'
  : 'wss://' + location.host;

const ws = new WebSocket(WS_URL);
let myNickname = null;

const $ = id => document.getElementById(id);
const nicknameInput = $('nickname');
const setNameBtn = $('setName');
const meNameSpan = $('meName');
const coinsEl = $('coins');
const tapValueEl = $('tapValue');
const myTapsEl = $('myTaps');
const tapImage = $('tapImage');
const iconFile = $('iconFile');
const uploadIconBtn = $('uploadIcon');
const shopList = $('shopList');
const chatLog = $('chatLog');
const chatInput = $('chatInput');
const sendChatBtn = $('sendChat');
const rankList = $('rankList');

// ニックネームを保存してたら読み込んで送信
const savedNick = localStorage.getItem('nickname');
if (savedNick) {
  myNickname = savedNick;
  meNameSpan.textContent = `あなた: ${myNickname}`;
  ws.addEventListener('open', () => {
    ws.send(JSON.stringify({ type: 'setName', nickname: myNickname }));
  });
}

setNameBtn.onclick = () => {
  const nick = nicknameInput.value.trim();
  if (!nick) return alert('ニックネームを入力してね！');
  ws.send(JSON.stringify({ type: 'setName', nickname: nick }));
};

uploadIconBtn.onclick = async () => {
  if (!myNickname) return alert('先にニックネームを設定してね！');
  const f = iconFile.files[0];
  if (!f) return alert('ファイルを選んでね！');
  const fd = new FormData();
  fd.append('icon', f);
  fd.append('nickname', myNickname);
  const res = await fetch('/upload-icon', { method: 'POST', body: fd });
  const json = await res.json();
  if (json.ok) {
    appendSystem('アイコンをアップロードしたよ！');
  } else {
    appendSystem('アップロード失敗...');
  }
};

tapImage.addEventListener('click', () => {
  if (!myNickname) return alert('ニックネームを設定してね！');
  ws.send(JSON.stringify({ type: 'tap' }));
});

sendChatBtn.onclick = sendChat;
chatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') sendChat();
});

function sendChat() {
  if (!myNickname) return alert('ニックネームを設定してね！');
  const text = chatInput.value.trim();
  if (!text) return;
  ws.send(JSON.stringify({ type: 'chat', text }));
  chatInput.value = '';
}

ws.onmessage = ev => {
  const data = JSON.parse(ev.data);

  if (data.type === 'init') {
    renderShop(data.shop);
    renderRanks(data.ranks);
    renderChats(data.chats);
    return;
  }

  if (data.type === 'setNameResult') {
    if (data.ok) {
      myNickname = data.nickname;
      localStorage.setItem('nickname', myNickname); // ← 保存！
      meNameSpan.textContent = `あなた: ${myNickname}`;
      nicknameInput.value = '';
      appendSystem(`ニックネーム設定: ${myNickname}`);
    } else {
      appendSystem('ニックネーム設定失敗');
    }
    return;
  }

  if (data.type === 'tap') {
    if (data.nickname === myNickname) {
      coinsEl.textContent = `コイン: ${data.coins}`;
      myTapsEl.textContent = `タップ数: ${data.taps}`;
      tapValueEl.textContent = `${data.tap_value} / タップ`;
    }
    return;
  }

  if (data.type === 'ranks') {
    renderRanks(data.ranks);
    return;
  }

  if (data.type === 'chat') {
    addChatMessage(data.nickname, data.icon, data.text, data.ts);
    return;
  }

  if (data.type === 'system') {
    appendSystem(data.text);
    return;
  }

  if (data.type === 'banned') {
    if (data.nickname === myNickname) {
      appendSystem('あなたはBANされました');
      ws.close();
    }
    return;
  }

  if (data.type === 'buyResult') {
    appendSystem(data.ok ? '購入成功！' : '購入失敗...');
    return;
  }
};

function renderShop(shop) {
  shopList.innerHTML = shop.map(item => `
    <div class="item">
      <div>${item.name} - ${item.price}コイン</div>
      <button onclick="buyItem('${item.id}')">買う</button>
    </div>
  `).join('');
}

function buyItem(id) {
  ws.send(JSON.stringify({ type: 'buy', itemId: id }));
}

function renderRanks(ranks) {
  rankList.innerHTML = ranks.map(r => `
    <li>${r.nickname} - タップ: ${r.taps} / コイン: ${r.coins}</li>
  `).join('');
}

function renderChats(chats) {
  chatLog.innerHTML = '';
  chats.forEach(c => addChatMessage(c.nickname, c.icon, c.text, c.ts));
}

function addChatMessage(nick, icon, text, ts) {
  const time = new Date(ts).toLocaleTimeString();
  const entry = document.createElement('div');
  entry.className = 'chat-entry';
  entry.innerHTML = `<strong>${nick}</strong> <span>${time}</span><div>${text}</div>`;
  chatLog.appendChild(entry);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function appendSystem(text) {
  const entry = document.createElement('div');
  entry.className = 'chat-entry';
  entry.innerHTML = `<em>system</em>: ${text}`;
  chatLog.appendChild(entry);
  chatLog.scrollTop = chatLog.scrollHeight;
}
