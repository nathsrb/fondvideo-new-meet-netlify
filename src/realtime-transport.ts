/**
 * SCELYO Live signalling: browser -> Supabase Realtime WebSocket.
 * No Netlify Function, Netlify Blobs, HTTP polling, or meeting server requests.
 *
 * The Supabase project is free-tier and is configured through public Vite env vars.
 * These public (non-secret) credentials identify the Realtime project, not a user.
 *
 * Small-group presence capacity/moderation is best-effort CLIENT-SIDE only.
 * This is not a secure replacement for server-enforced admission or moderation.
 * Room URLs are unguessable but anybody with the URL can participate.
 */
type JsonRecord = Record<string, any>;
type ApiResult<T = any> = { data: T };
type RoomSettings = { locked: boolean; allowScreenShare: boolean; allowRecording: boolean };
type Member = { id: string; name: string };
type PresenceMember = Member & { joinedAt: number; settings?: RoomSettings };
type IncomingMessage = { v: 1; type: string; payload: any };
type PhoenixMessage = { topic: string; event: string; payload: any; ref?: string | null; join_ref?: string | null };
type PresenceMeta = PresenceMember & { phx_ref?: string };
type PresenceState = Record<string, { metas: PresenceMeta[] }>;

const URL = String(import.meta.env.VITE_SCELYO_REALTIME_URL || '').trim();
const KEY = String(import.meta.env.VITE_SCELYO_REALTIME_KEY || '').trim();
const roomPattern = /^[a-z2-9]{12}$/;
const defaultSettings: RoomSettings = { locked: false, allowScreenShare: true, allowRecording: true };
const validSettings = (value: any): RoomSettings => ({
  locked: value?.locked === true,
  allowScreenShare: value?.allowScreenShare !== false,
  allowRecording: value?.allowRecording !== false,
});
const failure = (message: string): never => { throw new Error(message); };

function connectionUrl() {
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(URL) ||
      !KEY.startsWith('sb_publishable_')) {
    return failure('Le service gratuit SCELYO Realtime n’est pas configuré sur cette prévisualisation.');
  }
  return URL.replace(/^https:\/\//, 'wss://').replace(/\/$/, '') +
    '/realtime/v1/websocket?vsn=1.0.0&apikey=' + encodeURIComponent(KEY);
}

class RoomConnection {
  readonly connectionId = crypto.randomUUID();
  readonly ready: Promise<void>;
  private readonly topic: string;
  private socket: WebSocket | null = null;
  private listener: (message: IncomingMessage) => void = () => {};
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private reconnect: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private channelReady = false;
  private sequence = 0;
  private joinRef: string | null = null;
  private presence: PresenceState = {};
  private members = new Map<string, PresenceMember>();
  private memberId = '';
  private memberName = '';
  private joinedAt = 0;
  private ownSettings: RoomSettings = { ...defaultSettings };
  private lostConnection = false;
  private retries = 0;

  constructor(readonly room: string) {
    this.topic = 'realtime:scelyo-live-' + room;
    this.ready = this.open();
  }

  onMessage(callback: (message: IncomingMessage) => void) { this.listener = callback; }

  private deliver(message: IncomingMessage) {
    if (!this.closed) this.listener(message);
  }

  private push(topic: string, event: string, payload: any, ref: string | null = null) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN)
      throw new Error('Connexion temps réel interrompue. Reconnexion en cours.');
    this.socket.send(JSON.stringify({
      topic, event, payload, ref: ref ?? String(++this.sequence),
      join_ref: topic === 'phoenix' ? null : this.joinRef,
    } satisfies PhoenixMessage));
  }

  private async open(): Promise<void> {
    const address = connectionUrl();
    this.channelReady = false;
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let receivedInitialPresence = false;
      let acknowledgedJoin = false;
      const socket = new WebSocket(address);
      this.socket = socket;
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true; socket.close();
          reject(new Error('Service de réunion indisponible (délai de connexion dépassé).'));
        }
      }, 13000);
      const finish = () => {
        if (settled || !acknowledgedJoin || !receivedInitialPresence) return;
        settled = true;
        clearTimeout(timeout);
        this.channelReady = true;
        this.retries = 0;
        this.heartbeat = setInterval(() => {
          try { this.push('phoenix', 'heartbeat', {}); }
          catch { /* automatic reconnection handles dead sockets */ }
        }, 20000);
        resolve();
      };
      socket.onopen = () => {
        this.joinRef = String(++this.sequence);
        this.push(this.topic, 'phx_join', {
          config: {
            broadcast: { ack: false, self: false },
            presence: { enabled: true, key: this.connectionId },
            postgres_changes: [],
            private: false,
          },
        }, this.joinRef);
      };
      socket.onmessage = event => {
        if (typeof event.data !== 'string') return;
        let message: PhoenixMessage;
        try { message = JSON.parse(event.data); } catch { return; }
        if (message.topic !== this.topic) return;
        if (message.event === 'phx_reply' && message.ref === this.joinRef) {
          if (message.payload?.status !== 'ok') {
            if (!settled) {
              settled = true;
              clearTimeout(timeout);
              reject(new Error('La connexion SCELYO Realtime a été refusée.'));
            }
            return;
          }
          acknowledgedJoin = true;
          // A server with Presence enabled normally sends presence_state on join.
          // A tiny empty-state fallback avoids hanging on its initial snapshot.
          setTimeout(() => { if (!receivedInitialPresence) { receivedInitialPresence = true; finish(); } }, 700);
          finish();
        } else if (message.event === 'presence_state') {
          this.presence = message.payload || {};
          receivedInitialPresence = true;
          this.syncMembers();
          finish();
        } else if (message.event === 'presence_diff') {
          this.applyPresenceDiff(message.payload);
          this.syncMembers();
        } else if (message.event === 'broadcast') {
          this.receiveBroadcast(message.payload);
        } else if (message.event === 'phx_error' || message.event === 'phx_close') {
          socket.close();
        }
      };
      socket.onerror = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(new Error('Connexion au service gratuit de réunion impossible.'));
        }
      };
      socket.onclose = () => {
        clearTimeout(timeout);
        if (this.heartbeat) { clearInterval(this.heartbeat); this.heartbeat = null; }
        this.channelReady = false;
        if (!settled) {
          settled = true;
          reject(new Error('Le service de réunion a fermé la connexion.'));
        }
        if (!this.closed) {
          this.lostConnection = true;
          this.scheduleReconnect();
        }
      };
    });
  }

  private scheduleReconnect() {
    if (this.reconnect || this.closed) return;
    this.reconnect = setTimeout(() => {
      this.reconnect = null;
      if (this.closed) return;
      void this.open().then(async () => {
        if (!this.memberId) return;
        this.members.clear();
        try {
          await this.track();
          this.lostConnection = false;
          this.deliver({ v: 1, type: 'room.resynced', payload: { roomId: this.room } });
        } catch (error) { console.warn('SCELYO Realtime resync:', error); }
      }).catch(error => {
        console.warn('SCELYO Realtime connection:', error);
        this.retries++;
        this.scheduleReconnect();
      });
    }, Math.min(12000, 1500 * 2 ** Math.min(this.retries, 3)));
  }

  private metasToMembers(): PresenceMember[] {
    const members = Object.values(this.presence).flatMap(entry =>
      Array.isArray(entry?.metas) ? entry.metas : []);
    const unique = new Map<string, PresenceMember>();
    for (const candidate of members) {
      if (!candidate || typeof candidate.id !== 'string' ||
          typeof candidate.name !== 'string' || candidate.id.length > 80) continue;
      const member: PresenceMember = {
        id: candidate.id, name: candidate.name.slice(0, 40),
        joinedAt: Number.isFinite(candidate.joinedAt) ? candidate.joinedAt : Date.now(),
        ...(candidate.settings ? { settings: validSettings(candidate.settings) } : {}),
      };
      if (!unique.has(member.id)) unique.set(member.id, member);
    }
    return Array.from(unique.values()).sort((a, b) =>
      a.joinedAt - b.joinedAt || a.id.localeCompare(b.id));
  }

  private syncMembers() {
    const previous = this.members;
    const updated = this.metasToMembers();
    const next = new Map(updated.map(member => [member.id, member]));
    this.members = next;
    const hostId = updated[0]?.id || null;

    for (const prior of previous.values()) {
      if (!next.has(prior.id) && prior.id !== this.memberId) {
        this.deliver({ v: 1, type: 'entity.update', payload: {
          entity_type: 'room', entity_id: this.room,
          data: { kind: 'leave', id: prior.id, hostId },
        } });
      }
    }
    for (const member of updated) {
      if (member.id === this.memberId) continue;
      if (!previous.has(member.id)) {
        this.deliver({ v: 1, type: 'entity.update', payload: {
          entity_type: 'room', entity_id: this.room,
          data: { kind: 'join', member: { id: member.id, name: member.name }, hostId },
        } });
      }
    }
    const hostSettings = this.settings();
    if (previous.size && JSON.stringify(this.settingsFor(previous)) !== JSON.stringify(hostSettings)) {
      this.deliver({ v: 1, type: 'entity.update', payload: {
        entity_type: 'room', entity_id: this.room,
        data: { kind: 'settings', settings: hostSettings, hostId },
      } });
    }
    if (this.memberId && updated.findIndex(m => m.id === this.memberId) >= 7) {
      this.deliver({ v: 1, type: 'room.limit', payload: { roomId: this.room } });
    }
  }

  private settingsFor(members: Map<string, PresenceMember>): RoomSettings {
    const host = Array.from(members.values()).sort((a,b) =>
      a.joinedAt - b.joinedAt || a.id.localeCompare(b.id))[0];
    return host?.settings ? validSettings(host.settings) : { ...defaultSettings };
  }
  settings() { return this.settingsFor(this.members); }
  currentMembers(): Member[] {
    return Array.from(this.members.values()).map(({id,name}) => ({id,name}));
  }
  hostId(): string | null {
    return Array.from(this.members.values()).sort((a,b) =>
      a.joinedAt - b.joinedAt || a.id.localeCompare(b.id))[0]?.id || null;
  }

  private applyPresenceDiff(payload: any) {
    for (const [key, entry] of Object.entries(payload?.leaves || {}) as [string, { metas: PresenceMeta[] }][]) {
      const prior = this.presence[key]?.metas || [];
      const removedRefs = new Set((entry?.metas || []).map(meta => meta.phx_ref));
      const remaining = prior.filter(meta => !removedRefs.has(meta.phx_ref));
      if (remaining.length) this.presence[key] = { metas: remaining };
      else delete this.presence[key];
    }
    for (const [key, entry] of Object.entries(payload?.joins || {}) as [string, { metas: PresenceMeta[] }][]) {
      const prior = this.presence[key]?.metas || [];
      const next = [...prior];
      for (const meta of entry.metas || []) {
        const index = next.findIndex(existing => existing.phx_ref === meta.phx_ref);
        if (index < 0) next.push(meta);
        else next[index] = meta;
      }
      this.presence[key] = { metas: next };
    }
  }

  private receiveBroadcast(value: any) {
    if (value?.event !== 'scelyo' || !value?.payload) return;
    const event = value.payload;
    if (event?.roomId !== this.room || typeof event.from !== 'string') return;
    if (event.from === this.memberId) return;
    // Ignore messages from clients that are not present in the room.
    if (!this.members.has(event.from)) return;

    if (event.type === 'rtc.signal' && event.to === this.memberId && event.signal) {
      this.deliver({ v: 1, type: 'rtc.signal', payload: {
        roomId: this.room, from: event.from, signal: event.signal,
      } });
    } else if (event.type === 'entity.update' && event.data) {
      this.deliver({ v: 1, type: 'entity.update', payload: {
        entity_type: 'room', entity_id: this.room, data: event.data,
      } });
    } else if ((event.type === 'host.kick' || event.type === 'host.mute') &&
               event.to === this.memberId && event.from === this.hostId()) {
      this.deliver({ v: 1, type: event.type, payload: { roomId: this.room } });
    }
  }

  private sendEvent(type: string, data: JsonRecord) {
    if (!this.memberId || !this.channelReady) return failure('Réunion déconnectée.');
    this.push(this.topic, 'broadcast', {
      type: 'broadcast', event: 'scelyo',
      payload: { roomId: this.room, type, from: this.memberId, ...data },
    });
  }

  private async track() {
    if (!this.memberId) return;
    this.push(this.topic, 'presence', {
      type: 'presence', event: 'track',
      payload: {
        id: this.memberId, name: this.memberName, joinedAt: this.joinedAt,
        ...(this.hostId() === this.memberId || this.members.size === 0
          ? { settings: this.ownSettings } : {}),
      },
    });
  }

  async join(peerId: string, name: string): Promise<ApiResult> {
    if (!this.channelReady) await this.ready;
    if (this.memberId) throw new Error('Tu es déjà connecté à la réunion.');
    const members = this.metasToMembers();
    if (members.length >= 7)
      throw new Error('La réunion est complète : 7 personnes maximum.');
    const settings = this.settings();
    if (members.length && settings.locked)
      throw new Error('Cette réunion est verrouillée par l’organisateur.');
    this.memberId = peerId;
    this.memberName = name.slice(0, 40);
    this.joinedAt = Date.now();
    await this.track();
    // Presence is eventually consistent. A deterministic ordering resolves
    // simultaneous eighth joins on the client; not a server-enforced quota.
    return { data: {
      members: members.map(({id,name}) => ({id,name})),
      hostId: members[0]?.id || peerId,
      settings: members.length ? settings : defaultSettings,
    } };
  }

  async sendRoomAction(action: string, data: JsonRecord): Promise<ApiResult> {
    if (action === 'leave') {
      if (this.channelReady && this.memberId) {
        try { this.push(this.topic, 'presence', { type: 'presence', event: 'untrack', payload: {} }); }
        catch { /* WebSocket close also removes Presence */ }
      }
      this.memberId = '';
      return { data: { ok: true } };
    }
    if (!this.memberId || !this.channelReady) throw new Error('Réunion déconnectée.');
    if (action === 'signal') {
      if (!this.members.has(data.to) ||
          !['offer', 'answer', 'candidate', 'video.pref'].includes(data.signal?.type))
        throw new Error('Destinataire ou signal WebRTC invalide.');
      this.sendEvent('rtc.signal', { to: data.to, signal: data.signal });
    } else if (action === 'event') {
      if (!['chat', 'screen', 'recording'].includes(data.kind))
        throw new Error('Événement inconnu.');
      if (data.kind === 'chat' && (!String(data.text||'').trim() || String(data.text).length > 2000))
        throw new Error('Message vide ou trop long.');
      if (data.kind === 'screen' && data.active && !this.settings().allowScreenShare && this.hostId() !== this.memberId)
        throw new Error('Partage d’écran désactivé par l’organisateur.');
      if (data.kind === 'recording' && data.active && !this.settings().allowRecording && this.hostId() !== this.memberId)
        throw new Error('Enregistrement désactivé par l’organisateur.');
      this.sendEvent('entity.update', { data: {
        kind: data.kind, from: this.memberId, name: this.memberName,
        ...(data.kind === 'chat' ? { text: String(data.text), ts: Number(data.ts) || Date.now() }
          : { active: Boolean(data.active) }),
      } });
    } else if (action === 'settings') {
      if (this.hostId() !== this.memberId)
        throw new Error('Réservé à l’organisateur.');
      const next = { ...this.settings() };
      for (const key of ['locked','allowScreenShare','allowRecording'] as const) {
        if (typeof data[key] === 'boolean') next[key] = data[key];
      }
      this.ownSettings = next;
      await this.track();
      this.sendEvent('entity.update', { data: {
        kind: 'settings', settings: next, hostId: this.memberId,
      } });
      return { data: { settings: next } };
    } else if (action === 'mute' || action === 'kick') {
      if (this.hostId() !== this.memberId) throw new Error('Réservé à l’organisateur.');
      if (!this.members.has(data.to) || data.to === this.memberId)
        throw new Error('Participant introuvable.');
      this.sendEvent(action === 'mute' ? 'host.mute' : 'host.kick', { to: data.to });
    } else throw new Error('Action de réunion inconnue.');
    return { data: { ok: true } };
  }

  async getRoom(): Promise<ApiResult> {
    if (!this.channelReady) await this.ready;
    return { data: {
      members: this.currentMembers(), hostId: this.hostId(), settings: this.settings(),
    } };
  }

  disconnect() {
    this.closed = true;
    if (this.reconnect) clearTimeout(this.reconnect);
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.reconnect = null; this.heartbeat = null;
    if (this.socket) {
      if (this.socket.readyState === WebSocket.OPEN && this.channelReady) {
        try { this.push(this.topic, 'phx_leave', {}); } catch { /* ignore */ }
      }
      this.socket.close(); this.socket = null;
    }
    if (active === this) active = null;
  }
}

let active: RoomConnection | null = null;
export const ws = {
  connect(roomId: string): RoomConnection {
    if (!roomPattern.test(roomId)) throw new Error('Code de réunion invalide.');
    if (active) active.disconnect();
    active = new RoomConnection(roomId);
    return active;
  },
};

export const api = {
  async get<T = any>(url: string): Promise<ApiResult<T>> {
    const match = url.match(/^\/api\/rooms\/([a-z2-9]{12})$/);
    if (!match || !active || active.room !== match[1])
      throw new Error('Réunion non connectée.');
    return active.getRoom() as Promise<ApiResult<T>>;
  },
  async post<T = any>(url: string, payload: JsonRecord = {}): Promise<ApiResult<T>> {
    if (url === '/api/subscriptions' || url === '/api/subscriptions/remove')
      return { data: { ok: true } as T };
    const match = url.match(/^\/api\/rooms\/([a-z2-9]{12})\/(join|leave|signal|event|settings|mute|kick)$/);
    if (!match || !active || active.room !== match[1])
      throw new Error('Réunion non connectée.');
    if (match[2] === 'join')
      return active.join(String(payload.peer_id), String(payload.name || '')) as Promise<ApiResult<T>>;
    return active.sendRoomAction(match[2], payload) as Promise<ApiResult<T>>;
  },
};
