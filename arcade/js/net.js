// P2P rooms over WebRTC (Trystero — no server, $0).
// Signaling: Nostr public relays (the torrent-tracker strategy proved too flaky —
// dead public trackers silently strand every player in their own empty room).
// A pinned multi-relay list + STUN/TURN ice servers make discovery dependable.
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
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turns:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
  ],
};

let joinRoom = null, getRelaySockets = null, loadErr = null;

async function ensureLib() {
  if (joinRoom || loadErr) return;
  try {
    const m = await import('https://esm.sh/trystero@0.20.0/nostr');
    joinRoom = m.joinRoom;
    getRelaySockets = m.getRelaySockets || null;
  } catch (e) { loadErr = e; }
}

export class Net {
  constructor() {
    this.room = null; this.code = null; this.selfId = uid();
    this.isHost = false; this.peers = {};        // peerId -> profile
    this.onPeers = null; this.onMsg = null;      // callbacks
    this._send = null; this.joinedAt = 0;
  }
  available() { return !loadErr; }
  relayCount() {
    try {
      if (!getRelaySockets) return -1;
      const s = getRelaySockets();
      return Object.values(s).filter(ws => ws && ws.readyState === 1).length;
    } catch (e) { return -1; }
  }
  async join(code, profile, asHost) {
    await ensureLib();
    if (!joinRoom) throw new Error('P2P unavailable (network blocked)');
    this.code = code; this.isHost = !!asHost; this.profile = profile;
    this.joinedAt = Date.now();
    this.room = joinRoom(
      { appId: APP_ID, rtcConfig: RTC, relayUrls: RELAYS, relayRedundancy: 4 },
      'r-' + code.toLowerCase());
    const [send, recv] = this.room.makeAction('m');
    this._send = send;
    recv((data, peerId) => {
      if (!data || !data.t) return;
      if (data.t === 'hello') {
        this.peers[peerId] = data.p;
        send({ t: 'hi', p: this.profile, host: this.isHost }, peerId);
        if (this.onPeers) this.onPeers();
      } else if (data.t === 'hi') {
        this.peers[peerId] = data.p;
        if (data.host) this.hostId = peerId;
        if (this.onPeers) this.onPeers();
      } else if (this.onMsg) this.onMsg(data.t, data.p, peerId);
    });
    this.room.onPeerJoin(peerId => { send({ t: 'hello', p: this.profile }, peerId); });
    this.room.onPeerLeave(peerId => {
      delete this.peers[peerId];
      if (this.onPeers) this.onPeers();
    });
  }
  send(type, payload, to) { if (this._send) this._send({ t: type, p: payload }, to); }
  peerCount() { return Object.keys(this.peers).length; }
  leave() { try { if (this.room) this.room.leave(); } catch (e) { } this.room = null; this.peers = {}; }
}

export function makeRoomCode() {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let c = ''; for (let i = 0; i < 4; i++) c += A[Math.random() * A.length | 0];
  return c;
}
