// P2P rooms over WebRTC (Trystero — no server, $0), with a RELAY FALLBACK:
// when a direct WebRTC connection can't form (carrier-grade NAT, AP-isolated
// routers — and there is no free TURN service left alive), game traffic flows
// through the same public Nostr relays used for discovery. Slower, but it
// works on ANY network with zero setup. Direct P2P is always preferred and
// takes over per-peer the moment it connects.
import { uid } from './util.js';

const APP_ID = 'tunnel-divers-arcade-v2';        // bumped: players on old builds can't mix anyway
const RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
  'wss://nostr.mom',
  'wss://relay.snort.social',
];
const RTC = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ],
};
// NOTE: trystero 0.20's nostr strategy IGNORES the rtcConfig option and uses its
// own built-in STUN list (google + twilio) — verified by intercepting the
// RTCPeerConnection constructor. The RTC object above is aspirational only.
// debug: ?rtcoff=1 cripples WebRTC at the constructor so the relay fallback
// carries everything — simulates carrier-NAT / AP-isolation where direct fails
const RTC_OFF = typeof location !== 'undefined' && /[?&]rtcoff=1/.test(location.search);
if (RTC_OFF && typeof window !== 'undefined' && window.RTCPeerConnection) {
  const Orig = window.RTCPeerConnection;
  window.RTCPeerConnection = function (cfg) {
    return new Orig({ ...cfg, iceServers: [{ urls: 'turn:127.0.0.1:9', username: 'x', credential: 'x' }], iceTransportPolicy: 'relay' });
  };
  window.RTCPeerConnection.prototype = Orig.prototype;
}

const EPHEMERAL_KIND = 20176;                    // 20000-29999 = relays don't store

let joinRoom = null, getRelaySockets = null, libSelfId = null, loadErr = null;
let nostrTools = null;                           // pure helpers for our own events

async function ensureLib() {
  if (joinRoom || loadErr) return;
  try {
    const m = await import('https://esm.sh/trystero@0.20.0/nostr');
    joinRoom = m.joinRoom;
    libSelfId = m.selfId || null;
    getRelaySockets = m.getRelaySockets || null;
  } catch (e) { loadErr = e; }
}
async function ensureNostr() {
  if (nostrTools !== null) return;
  try { nostrTools = await import('https://esm.sh/nostr-tools@2.7.2/pure'); }
  catch (e) { nostrTools = false; }              // fallback unavailable, rtc-only
}

export class Net {
  constructor() {
    this.room = null; this.code = null; this.selfId = uid();
    this.isHost = false; this.peers = {};        // peerId -> profile
    this.rtc = {};                               // peerId -> true once DIRECTLY connected
    this.relaySeen = {};                         // peerId -> last presence timestamp
    this.onPeers = null; this.onMsg = null;      // callbacks
    this._send = null; this.joinedAt = 0;
    this._socks = []; this._seenIds = new Set(); this._timers = [];
    this._active = false;
  }
  available() { return !loadErr; }
  relayCount() {
    try {
      const own = this._socks.filter(ws => ws && ws.readyState === 1).length;
      if (!getRelaySockets) return own || -1;
      const s = getRelaySockets();
      return Math.max(own, Object.values(s).filter(ws => ws && ws.readyState === 1).length);
    } catch (e) { return -1; }
  }
  relayMode() {   // any peer we can only reach through the relays?
    return Object.keys(this.peers).some(id => !this.rtc[id]);
  }
  async join(code, profile, asHost) {
    await ensureLib();
    if (!joinRoom) throw new Error('P2P unavailable (network blocked)');
    // CRITICAL: selfId must be trystero's id — the one peers key us by. A homemade
    // uid gives every client a different view of the player list (each sees itself
    // under an id nobody else has → seats scramble, turns deadlock, ready-ups hang).
    if (libSelfId) this.selfId = libSelfId;
    this.code = code; this.isHost = !!asHost; this.profile = profile;
    this.joinedAt = Date.now(); this._active = true;
    this.room = joinRoom(
      { appId: APP_ID, rtcConfig: RTC, relayUrls: RELAYS, relayRedundancy: 4 },
      'r-' + code.toLowerCase());
    const [send, recv] = this.room.makeAction('m');
    this._send = send;
    recv((data, peerId) => this._dispatch(data, peerId, 'rtc'));
    this.room.onPeerJoin(peerId => {
      this.rtc[peerId] = true;                   // direct link is up — prefer it
      send({ t: 'hello', p: this.profile }, peerId);
      if (this.onPeers) this.onPeers();
    });
    this.room.onPeerLeave(peerId => {
      delete this.rtc[peerId];
      if (!this.relaySeen[peerId]) { delete this.peers[peerId]; if (this.onPeers) this.onPeers(); }
    });
    this._startRelayLink();
  }
  _dispatch(data, peerId, via) {
    if (!data || !data.t) return;
    if (data.t === 'hello') {
      this.peers[peerId] = data.p;
      this.send('hi', null, peerId, { t: 'hi', p: this.profile, host: this.isHost });
      if (this.onPeers) this.onPeers();
    } else if (data.t === 'hi') {
      this.peers[peerId] = data.p;
      if (data.host) this.hostId = peerId;
      if (this.onPeers) this.onPeers();
    } else if (this.onMsg) this.onMsg(data.t, data.p, peerId);
  }
  /* -------- our own ephemeral-event channel over the public nostr relays -------- */
  async _startRelayLink() {
    await ensureNostr();
    if (!nostrTools || !this._active) return;
    this._sk = nostrTools.generateSecretKey();
    this._topic = 'tdarc2-' + this.code.toLowerCase();
    const req = JSON.stringify(['REQ', 'tdsub', {
      kinds: [EPHEMERAL_KIND], '#x': [this._topic], since: Math.floor(Date.now() / 1000) - 5,
    }]);
    const openSock = (url) => {
      let ws;
      try { ws = new WebSocket(url); } catch (e) { return; }
      ws.onopen = () => { try { ws.send(req); } catch (e) { } };
      ws.onmessage = (m) => this._onRelayMsg(m);
      ws.onclose = () => {          // relays drop idle sockets; keep clawing back
        const i = this._socks.indexOf(ws);
        if (i >= 0) this._socks.splice(i, 1);
        if (this._active) this._timers.push(setTimeout(() => { if (this._active) openSock(url); }, 8000));
      };
      this._socks.push(ws);
    };
    for (const url of RELAYS) openSock(url);
    // presence heartbeat: this is how peers find each other even when RTC is dead
    const beat = () => this._pub({ t: 'p', sid: this.selfId, name: this.profile.name });
    beat();
    this._timers.push(setInterval(beat, 2500));
    this._timers.push(setInterval(() => {        // prune silent relay-only peers
      const cut = Date.now() - 15000;
      for (const sid in this.relaySeen) {
        if (this.relaySeen[sid] < cut) {
          delete this.relaySeen[sid];
          if (!this.rtc[sid]) { delete this.peers[sid]; if (this.onPeers) this.onPeers(); }
        }
      }
    }, 5000));
  }
  _pub(obj) {
    if (!nostrTools || !this._sk) return;
    let ev;
    try {
      ev = nostrTools.finalizeEvent({
        kind: EPHEMERAL_KIND, created_at: Math.floor(Date.now() / 1000),
        tags: [['x', this._topic]], content: JSON.stringify(obj),
      }, this._sk);
    } catch (e) { return; }
    const msg = JSON.stringify(['EVENT', ev]);
    for (const ws of this._socks) if (ws.readyState === 1) { try { ws.send(msg); } catch (e) { } }
  }
  _onRelayMsg(m) {
    let arr; try { arr = JSON.parse(m.data); } catch (e) { return; }
    if (!Array.isArray(arr) || arr[0] !== 'EVENT') return;
    const ev = arr[2];
    if (!ev || this._seenIds.has(ev.id)) return;
    this._seenIds.add(ev.id);
    if (this._seenIds.size > 3000) this._seenIds = new Set([...this._seenIds].slice(-1000));
    let c; try { c = JSON.parse(ev.content); } catch (e) { return; }
    if (!c || c.sid === this.selfId) return;
    if (c.t === 'p') {                           // presence: someone is in this room
      const isNew = !this.relaySeen[c.sid] && !this.peers[c.sid];
      this.relaySeen[c.sid] = Date.now();
      if (isNew && !this.rtc[c.sid]) {
        // introduce ourselves over the relay; the normal hello/hi handshake
        // runs on top and fills in the full profile
        this._pub({ t: 'm', sid: this.selfId, to: c.sid, d: { t: 'hello', p: this.profile } });
      }
    } else if (c.t === 'm') {                    // game traffic via relay
      if (c.to && c.to !== this.selfId) return;
      this.relaySeen[c.sid] = Date.now();
      if (this.rtc[c.sid]) return;               // direct link up — relay copy is a dupe
      this._dispatch(c.d, c.sid, 'relay');
    }
  }
  /* -------- unified send: direct where possible, relay where not -------- */
  send(type, payload, to, raw) {
    const data = raw || { t: type, p: payload };
    if (this._send) {
      if (to) { if (this.rtc[to]) this._send(data, to); }
      else this._send(data);
    }
    const needsRelay = to
      ? (!this.rtc[to])
      : Object.keys(this.peers).some(id => !this.rtc[id]) || Object.keys(this.relaySeen).some(id => !this.rtc[id]);
    if (needsRelay) this._pub({ t: 'm', sid: this.selfId, to: to || null, d: data });
  }
  peerCount() { return Object.keys(this.peers).length; }
  leave() {
    this._active = false;
    try { if (this.room) this.room.leave(); } catch (e) { }
    this.room = null; this.peers = {}; this.rtc = {}; this.relaySeen = {};
    for (const t of this._timers) { clearTimeout(t); clearInterval(t); }
    this._timers = [];
    for (const ws of this._socks) { try { ws.close(); } catch (e) { } }
    this._socks = [];
  }
}

export function makeRoomCode() {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let c = ''; for (let i = 0; i < 4; i++) c += A[Math.random() * A.length | 0];
  return c;
}
