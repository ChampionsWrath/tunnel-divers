// P2P rooms over WebRTC (Trystero, torrent signaling — no server, $0).
// Loaded lazily so local play never depends on the network.
import { uid } from './util.js';

const APP_ID = 'tunnel-divers-arcade-v1';
let joinRoom = null, loadErr = null;

async function ensureLib() {
  if (joinRoom || loadErr) return;
  try {
    const m = await import('https://esm.sh/trystero@0.20.0/torrent');
    joinRoom = m.joinRoom;
  } catch (e) { loadErr = e; }
}

export class Net {
  constructor() {
    this.room = null; this.code = null; this.selfId = uid();
    this.isHost = false; this.peers = {};        // peerId -> profile
    this.onPeers = null; this.onMsg = null;      // callbacks
    this._send = null;
  }
  available() { return !loadErr; }
  async join(code, profile, asHost) {
    await ensureLib();
    if (!joinRoom) throw new Error('P2P unavailable (network blocked)');
    this.code = code; this.isHost = !!asHost; this.profile = profile;
    this.room = joinRoom({ appId: APP_ID }, 'r-' + code.toLowerCase());
    const [send, recv] = this.room.makeAction('m');
    this._send = send;
    recv((data, peerId) => {
      if (!data || !data.t) return;
      if (data.t === 'hello') {
        this.peers[peerId] = data.p;
        // answer so late joiners learn about us (and who hosts)
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
