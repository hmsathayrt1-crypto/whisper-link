// WhisperLink - WebRTC Signaling Server
// Cloudflare Worker

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // API Routes
    if (url.pathname.startsWith('/api/')) {
      const path = url.pathname.replace('/api', '');
      
      if (path === '/signal' && request.method === 'POST') {
        const data = await request.json();
        const { roomId, type, payload, peerId } = data;
        
        const key = `room:${roomId}:${peerId}`;
        await env.SIGNALS.put(key, JSON.stringify({ type, payload }), { expirationTtl: 300 });
        
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (path === '/signal' && request.method === 'GET') {
        const roomId = url.searchParams.get('roomId');
        const peerId = url.searchParams.get('peerId');
        
        const list = await env.SIGNALS.list({ prefix: `room:${roomId}:` });
        const signals = [];
        
        for (const key of list.keys) {
          if (!key.name.includes(`:${peerId}`)) {
            const data = await env.SIGNALS.get(key.name);
            if (data) {
              signals.push(JSON.parse(data));
              await env.SIGNALS.delete(key.name);
            }
          }
        }
        
        return new Response(JSON.stringify({ signals }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Serve HTML
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return new Response(HTML, {
        headers: { 'Content-Type': 'text/html' }
      });
    }

    return new Response('WhisperLink', { status: 404 });
  }
};

const HTML = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WhisperLink - قناة تواصل مشفرة</title>
  <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Tahoma, sans-serif; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); min-height: 100vh; color: #fff; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    h1 { text-align: center; margin-bottom: 30px; color: #00d9ff; }
    .card { background: rgba(255,255,255,0.1); border-radius: 15px; padding: 25px; margin-bottom: 20px; backdrop-filter: blur(10px); }
    .btn { background: linear-gradient(90deg, #00d9ff, #00ff88); border: none; padding: 15px 30px; border-radius: 25px; color: #1a1a2e; font-weight: bold; cursor: pointer; width: 100%; font-size: 16px; margin: 10px 0; transition: transform 0.2s; }
    .btn:hover { transform: scale(1.02); }
    .btn-secondary { background: rgba(255,255,255,0.2); color: #fff; }
    .btn-small { padding: 10px 20px; font-size: 14px; width: auto; }
    input { width: 100%; padding: 15px; border-radius: 10px; border: 2px solid #00d9ff; background: rgba(255,255,255,0.1); color: #fff; font-size: 18px; text-align: center; margin: 10px 0; }
    input::placeholder { color: rgba(255,255,255,0.5); }
    #chatArea { display: none; }
    #messages { height: 400px; overflow-y: auto; margin-bottom: 15px; }
    .message { padding: 12px 16px; margin: 8px 0; border-radius: 15px; max-width: 80%; word-wrap: break-word; }
    .message.sent { background: linear-gradient(90deg, #00d9ff, #00ff88); color: #1a1a2e; margin-left: auto; border-bottom-left-radius: 2px; }
    .message.received { background: rgba(255,255,255,0.15); border-bottom-right-radius: 2px; }
    .copy-btn { background: rgba(0,0,0,0.3); border: none; padding: 4px 10px; border-radius: 5px; color: #fff; font-size: 12px; cursor: pointer; margin-right: 8px; }
    .file-area { border: 2px dashed #00d9ff; border-radius: 10px; padding: 20px; text-align: center; margin: 15px 0; cursor: pointer; }
    .file-area:hover { background: rgba(0,217,255,0.1); }
    .status { text-align: center; padding: 10px; border-radius: 8px; margin: 10px 0; }
    .status.connected { background: rgba(0,255,136,0.2); color: #00ff88; }
    .status.waiting { background: rgba(255,200,0,0.2); color: #ffc800; }
    .room-code { font-size: 32px; letter-spacing: 8px; font-weight: bold; color: #00d9ff; text-align: center; padding: 15px; background: rgba(0,0,0,0.3); border-radius: 10px; margin: 15px 0; }
    #qrCode { display: flex; justify-content: center; margin: 20px 0; }
    #qrCode canvas { border-radius: 10px; padding: 10px; background: #fff; }
    .share-link { background: rgba(0,0,0,0.3); padding: 10px; border-radius: 8px; text-align: center; word-break: break-all; font-size: 12px; margin: 10px 0; cursor: pointer; }
    .share-link:hover { background: rgba(0,217,255,0.2); }
    .tab-buttons { display: flex; gap: 10px; margin-bottom: 15px; }
    .tab-buttons .btn { margin: 0; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔗 WhisperLink</h1>
    <div id="welcomeArea" class="card">
      <div class="tab-buttons">
        <button class="btn" onclick="createRoom()">إنشاء قناة</button>
        <button class="btn btn-secondary" onclick="showJoin()">دخول لقناة</button>
      </div>
    </div>
    <div id="joinArea" class="card" style="display:none;">
      <h2>أدخل رمز القناة</h2>
      <input type="text" id="roomCodeInput" placeholder="مثل: 12345" maxlength="5">
      <button class="btn" onclick="joinRoomWithCode()">دخول</button>
      <button class="btn btn-secondary" onclick="showWelcome()">رجوع</button>
    </div>
    <div id="roomInfo" class="card" style="display:none;">
      <div id="shareCode"></div>
      <div id="qrCode"></div>
      <div class="share-link" onclick="copyLink()" id="shareLink"></div>
      <p style="text-align:center;margin:10px 0;">امسح QR أو شارك الرابط مع الطرف الآخر</p>
      <div id="connectionStatus" class="status waiting">في انتظار الاتصال...</div>
      <button class="btn" onclick="startChat()">بدء المحادثة</button>
    </div>
    <div id="chatArea">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <button class="btn btn-secondary btn-small" onclick="showWelcome()">← رجوع</button>
        <span id="chatRoomCode" style="color:#00d9ff;"></span>
      </div>
      <div id="messages"></div>
      <div class="file-area" onclick="sendFile()">📎 أرسل ملف <input type="file" id="fileInput" style="display:none" onchange="handleFile(this)"></div>
      <div style="display:flex;gap:10px;">
        <input type="text" id="msgInput" placeholder="اكتب رسالتك..." onkeypress="if(event.key==='Enter')sendMsg()">
        <button class="btn" style="width:auto;margin:10px 0;" onclick="sendMsg()">إرسال</button>
      </div>
    </div>
  </div>
  <script>
    var BASE_URL = window.location.origin;
    var roomId = null;
    var peerId = Math.random().toString(36).substr(2, 9);
    var peerConnection = null;
    var dataChannel = null;
    var pollingInterval = null;

    function generateRoomId() { return Math.floor(10000 + Math.random() * 90000).toString(); }

    window.onload = function() {
      var urlParams = new URLSearchParams(window.location.search);
      var joinId = urlParams.get('room');
      if (joinId) { document.getElementById('roomCodeInput').value = joinId; joinRoomWithCode(); }
    };

    async function createRoom() {
      roomId = generateRoomId();
      document.getElementById('welcomeArea').style.display = 'none';
      document.getElementById('roomInfo').style.display = 'block';
      document.getElementById('shareCode').innerHTML = '<div class="room-code">' + roomId + '</div>';
      var joinLink = BASE_URL + '?room=' + roomId;
      var qrContainer = document.getElementById('qrCode');
      qrContainer.innerHTML = '';
      QRCode.toCanvas(joinLink, { width: 200, margin: 1 }, function(err, canvas) { if (!err) qrContainer.appendChild(canvas); });
      document.getElementById('shareLink').innerHTML = '🔗 ' + joinLink + '<br><small>امسخ للنسخ</small>';
      startPolling();
      await createWebRTCConnection(true);
    }

    function showJoin() { document.getElementById('welcomeArea').style.display = 'none'; document.getElementById('joinArea').style.display = 'block'; }
    function showWelcome() { document.getElementById('joinArea').style.display = 'none'; document.getElementById('roomInfo').style.display = 'none'; document.getElementById('chatArea').style.display = 'none'; document.getElementById('welcomeArea').style.display = 'block'; }

    async function joinRoomWithCode() {
      roomId = document.getElementById('roomCodeInput').value;
      if (!roomId || roomId.length !== 5) { alert('يرجى إدخال رمز صحيح!'); return; }
      document.getElementById('joinArea').style.display = 'none';
      document.getElementById('roomInfo').style.display = 'block';
      document.getElementById('shareCode').innerHTML = '<div class="room-code">' + roomId + '</div>';
      var joinLink = BASE_URL + '?room=' + roomId;
      var qrContainer = document.getElementById('qrCode');
      qrContainer.innerHTML = '';
      QRCode.toCanvas(joinLink, { width: 200, margin: 1 }, function(err, canvas) { if (!err) qrContainer.appendChild(canvas); });
      document.getElementById('shareLink').innerHTML = '🔗 ' + joinLink + '<br><small>امسخ للنسخ</small>';
      startPolling();
      await createWebRTCConnection(false);
    }

    function copyLink() {
      var joinLink = BASE_URL + '?room=' + roomId;
      navigator.clipboard.writeText(joinLink);
      document.getElementById('shareLink').innerHTML = '✅ تم النسخ!';
      setTimeout(function() { document.getElementById('shareLink').innerHTML = '🔗 ' + joinLink + '<br><small>امسخ للنسخ</small>'; }, 1500);
    }

    async function createWebRTCConnection(isInitiator) {
      peerConnection = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      peerConnection.onicecandidate = async function(e) {
        if (e.candidate) {
          await fetch('/api/signal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomId: roomId, peerId: peerId, type: 'candidate', payload: e.candidate }) });
        }
      };
      peerConnection.onconnectionstatechange = function() {
        var status = document.getElementById('connectionStatus');
        if (peerConnection.connectionState === 'connected') { status.className = 'status connected'; status.textContent = '✅ متصل!'; }
      };
      if (isInitiator) {
        dataChannel = peerConnection.createDataChannel('data');
        setupDataChannel();
        var offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        await fetch('/api/signal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomId: roomId, peerId: peerId, type: 'offer', payload: offer }) });
      } else {
        peerConnection.ondatachannel = function(e) { dataChannel = e.channel; setupDataChannel(); };
      }
    }

    function setupDataChannel() {
      dataChannel.onopen = function() { document.getElementById('connectionStatus').className = 'status connected'; document.getElementById('connectionStatus').textContent = '✅ متصل!'; };
      dataChannel.onmessage = function(e) {
        var msg = JSON.parse(e.data);
        if (msg.type === 'file') { addMessage('📎 ' + msg.name, 'received'); } else { addMessage(msg.text, 'received'); }
      };
    }

    function startPolling() {
      pollingInterval = setInterval(async function() {
        try {
          var resp = await fetch('/api/signal?roomId=' + roomId + '&peerId=' + peerId);
          var data = await resp.json();
          for (var i = 0; i < data.signals.length; i++) {
            var signal = data.signals[i];
            if (signal.type === 'offer' || signal.type === 'answer') {
              var desc = new RTCSessionDescription(signal.payload);
              await peerConnection.setRemoteDescription(desc);
              if (signal.type === 'offer') {
                var answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                await fetch('/api/signal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomId: roomId, peerId: peerId, type: 'answer', payload: answer }) });
              }
            } else if (signal.type === 'candidate') { await peerConnection.addIceCandidate(new RTCIceCandidate(signal.payload)); }
          }
        } catch (e) { console.log('Polling...'); }
      }, 2000);
    }

    function startChat() { document.getElementById('roomInfo').style.display = 'none'; document.getElementById('chatArea').style.display = 'block'; document.getElementById('chatRoomCode').textContent = 'القناة: ' + roomId; }

    function sendMsg() {
      var input = document.getElementById('msgInput');
      var text = input.value.trim();
      if (!text || !dataChannel || dataChannel.readyState !== 'open') return;
      dataChannel.send(JSON.stringify({ type: 'text', text: text }));
      addMessage(text, 'sent');
      input.value = '';
    }

    function addMessage(text, type) {
      var container = document.getElementById('messages');
      var div = document.createElement('div');
      div.className = 'message ' + type;
      div.innerHTML = '<span>' + escapeHtml(text) + '</span><button class="copy-btn" onclick="copyText(this)">📋 نسخ</button>';
      container.appendChild(div);
      container.scrollTop = container.scrollHeight;
    }

    function escapeHtml(text) { return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    function copyText(btn) { var text = btn.previousElementSibling.textContent; navigator.clipboard.writeText(text); btn.textContent = '✅'; setTimeout(function() { btn.textContent = '📋 نسخ'; }, 1500); }
    function sendFile() { document.getElementById('fileInput').click(); }
    function handleFile(input) {
      var file = input.files[0];
      if (!file || !dataChannel || dataChannel.readyState !== 'open') return;
      var reader = new FileReader();
      reader.onload = function() {
        dataChannel.send(JSON.stringify({ type: 'file', name: file.name, data: reader.result }));
        addMessage('📎 ' + file.name, 'sent');
      };
      reader.readAsDataURL(file);
    }
  </script>
</body>
</html>`;