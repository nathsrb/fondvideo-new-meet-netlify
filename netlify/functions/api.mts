declare global { var Netlify: { env: { get(name: string): string | undefined } } | undefined; }
/**
 * Netlify preview signalling service for FondVidéo New Meet.
 * - Room membership and RTC offers/answers/candidates are stored in DEPLOY-scoped
 *   Netlify Blobs, so a preview cannot modify production storage.
 * - Polling is a compatibility mechanism, not a low-latency WebSocket service.
 * - No TURN relay is configured, so some NAT pairs may be unable to connect.
 * - Do not use for sensitive or high-scale rooms without stronger access control.
 */
import { getDeployStore } from '@netlify/blobs';
import type { Config } from '@netlify/functions';

type Member = {
  id: string;
  name: string;
  connection_id: string;
  joined_at: number;
  session_token: string;
};
type RoomEvent = { v: 1; type: string; payload: unknown };

const store = () => getDeployStore({ name: 'fondvideo-preview-signal', consistency: 'strong' });
const roomPattern = /^[a-z2-9]{12}$/;
const uuidPattern = /^[0-9a-f-]{36}$/i;
const maxAge = 2 * 60 * 60 * 1000;
type RoomSettings = { locked: boolean; allowScreenShare: boolean; allowRecording: boolean };
const defaultSettings: RoomSettings = { locked: false, allowScreenShare: true, allowRecording: true };
const settingsKey = (room: string) => `settings/${room}`;
async function getSettings(room: string): Promise<RoomSettings> {
  const value = await store().get(settingsKey(room), { type: 'json' }) as Partial<RoomSettings> | null;
  return { ...defaultSettings, ...(value || {}) };
}

function success(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}
function fail(error: string, status = 400) { return success({ error }, status); }
function memberKey(room: string, id: string) { return `members/${room}/${id}`; }
function eventPrefix(connectionId: string) { return `signals/${connectionId}/`; }

async function getMember(room: string, id: string): Promise<Member | null> {
  if (!uuidPattern.test(id)) return null;
  const member = await store().get(memberKey(room, id), { type: 'json' }) as Member | null;
  if (!member || Date.now() - member.joined_at > maxAge) return null;
  return member;
}
async function membersOf(room: string): Promise<Member[]> {
  const data = await store().list({ prefix: `members/${room}/` });
  const all = await Promise.all(data.blobs.map(async ({ key }) => {
    try { return await store().get(key, { type: 'json' }) as Member | null; }
    catch { return null; }
  }));
  return all.filter((entry): entry is Member => !!entry && Date.now() - entry.joined_at < maxAge)
    .sort((a, b) => a.joined_at - b.joined_at || a.id.localeCompare(b.id));
}
async function authorize(room: string, from: unknown, token: unknown): Promise<Member | null> {
  if (typeof from !== 'string' || typeof token !== 'string') return null;
  const member = await getMember(room, from);
  return member && member.session_token === token ? member : null;
}
async function enqueue(connectionId: string, message: RoomEvent) {
  if (!uuidPattern.test(connectionId)) return;
  const id = `${Date.now().toString().padStart(13, '0')}-${crypto.randomUUID()}`;
  await store().setJSON(eventPrefix(connectionId) + id, message);
}
async function broadcast(room: string, message: RoomEvent, except: string | null = null) {
  const members = await membersOf(room);
  await Promise.all(members.filter(m => m.connection_id !== except)
    .map(m => enqueue(m.connection_id, message)));
}
async function notifyRoom(room: string, data: unknown, except: string | null = null) {
  await broadcast(room, { v: 1, type: 'entity.update', payload: { entity_type: 'room', entity_id: room, data } }, except);
}
async function parseBody(request: Request): Promise<Record<string, any>> {
  try {
    const value = await request.json();
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  try {
    if (method === 'GET' && path === '/api/_healthcheck') {
      return success({ message: 'Success', transport: 'netlify-preview-polling' });
    }
    if (method === 'GET' && path === '/api/drive/config') {
      // OAuth client IDs are public. Never return a client secret or access token.
      const clientId = globalThis.Netlify?.env.get('GOOGLE_OAUTH_CLIENT_ID') || '';
      return clientId.endsWith('.apps.googleusercontent.com')
        ? success({ configured: true, clientId }) : success({ configured: false });
    }
    if (method === 'GET' && path === '/api/ws/events') {
      const connectionId = url.searchParams.get('connection_id') || '';
      const after = url.searchParams.get('after') || '';
      if (!uuidPattern.test(connectionId) || after.length > 100) return fail('Identifiant de session invalide.', 400);
      const prefix = eventPrefix(connectionId);
      const { blobs } = await store().list({ prefix });
      const pending = blobs.map(b => b.key.slice(prefix.length))
        .filter(id => id > after).sort().slice(0, 70);
      const events = await Promise.all(pending.map(async id => {
        const msg = await store().get(prefix + id, { type: 'json' }) as RoomEvent | null;
        return msg ? { id, message: msg } : null;
      }));
      return success({ events: events.filter(Boolean) });
    }
    if (method === 'POST' && (path === '/api/subscriptions' || path === '/api/subscriptions/remove')) {
      // Blobs membership determines event subscribers; no separate subscription table.
      return success({ ok: true });
    }

    const match = path.match(/^\/api\/rooms\/([a-z2-9]{12})(?:\/([a-z-]+))?$/);
    if (!match) return fail('Route inconnue.', 404);
    const room = match[1], action = match[2] || '';
    if (!roomPattern.test(room)) return fail('Code de réunion invalide.', 400);

    if (method === 'GET' && action === '') {
      const members = await membersOf(room);
      return success({ members: members.map(m => ({ id: m.id, name: m.name })), hostId: members[0]?.id || null, settings: await getSettings(room) });
    }
    if (method !== 'POST') return fail('Méthode non autorisée.', 405);
    const body = await parseBody(request);

    if (action === 'join') {
      const { peer_id, connection_id, name } = body;
      if (!uuidPattern.test(String(peer_id)) || !uuidPattern.test(String(connection_id)) ||
          typeof name !== 'string' || !name.trim() || name.length > 40) return fail('Participant invalide.');
      const members = await membersOf(room);
      if (members.length >= 6) return fail('Prévisualisation limitée à six participants.', 409);
      const settings = await getSettings(room);
      if (members.length && settings.locked) return fail('Cette réunion est verrouillée par son organisateur.', 403);
      // Reset previous room restrictions for the first member of a new session.
      if (!members.length) await store().setJSON(settingsKey(room), defaultSettings);
      if (members.some(m => m.id === peer_id)) return fail('Participant déjà connecté.', 409);
      const member: Member = {
        id: peer_id, connection_id, name: name.trim(), joined_at: Date.now(), session_token: crypto.randomUUID(),
      };
      const { modified } = await store().setJSON(memberKey(room, peer_id), member, { onlyIfNew: true });
      if (!modified) return fail('Participant déjà connecté.', 409);
      await notifyRoom(room, { kind: 'join', member: { id: peer_id, name: member.name }, hostId: members[0]?.id || peer_id }, connection_id);
      return success({
        members: members.map(m => ({ id: m.id, name: m.name })),
        hostId: members[0]?.id || peer_id,
        sessionToken: member.session_token,
        settings: members.length ? settings : defaultSettings,
      });
    }

    const from = action === 'leave' ? body.peer_id : body.from;
    const sender = await authorize(room, from, body.session_token);
    if (!sender) return fail('Session non autorisée ou expirée.', 403);

    if (action === 'leave') {
      await store().delete(memberKey(room, sender.id));
      const remaining = await membersOf(room);
      if (!remaining.length) await store().delete(settingsKey(room));
      await notifyRoom(room, { kind: 'leave', id: sender.id, hostId: remaining[0]?.id || null });
      return success({ ok: true });
    }
    if (action === 'settings') {
      const members = await membersOf(room);
      if (members[0]?.id !== sender.id) return fail('Réservé à l’hôte.', 403);
      const current = await getSettings(room);
      const changes: Partial<RoomSettings> = {};
      for (const key of ['locked', 'allowScreenShare', 'allowRecording'] as const) {
        if (key in body) {
          if (typeof body[key] !== 'boolean') return fail('Réglage de sécurité invalide.', 400);
          changes[key] = body[key];
        }
      }
      const settings = { ...current, ...changes };
      await store().setJSON(settingsKey(room), settings);
      await notifyRoom(room, { kind: 'settings', settings, hostId: sender.id });
      return success({ settings });
    }
    if (action === 'signal') {
      const { to, signal } = body;
      if (typeof to !== 'string' || !uuidPattern.test(to) || !signal ||
          !['offer', 'answer', 'candidate'].includes(signal.type)) return fail('Signal WebRTC invalide.');
      if (JSON.stringify(signal).length > 120000) return fail('Signal trop volumineux.', 413);
      const recipient = await getMember(room, to);
      if (!recipient) return fail('Participant introuvable.', 404);
      await enqueue(recipient.connection_id, { v: 1, type: 'rtc.signal', payload: { roomId: room, from: sender.id, signal } });
      return success({ ok: true });
    }
    if (action === 'event') {
      const { kind, text, active, ts } = body;
      if (!['chat', 'recording', 'screen'].includes(kind)) return fail('Type de message invalide.');
      const settings = await getSettings(room);
      const members = await membersOf(room);
      const host = members[0]?.id === sender.id;
      if (kind === 'screen' && active && !settings.allowScreenShare && !host)
        return fail('L’organisateur a désactivé le partage d’écran.', 403);
      if (kind === 'recording' && active && !settings.allowRecording && !host)
        return fail('L’organisateur a désactivé les enregistrements.', 403);
      if (kind === 'chat' && (typeof text !== 'string' || text.length < 1 || text.length > 2000)) {
        return fail('Message vide ou trop long.');
      }
      await notifyRoom(room, kind === 'chat'
        ? { kind, from: sender.id, name: sender.name, text, ts: Number(ts) || Date.now() }
        : { kind, from: sender.id, active: Boolean(active) }, sender.connection_id);
      return success({ ok: true });
    }
    if (action === 'mute' || action === 'kick') {
      const members = await membersOf(room);
      if (members[0]?.id !== sender.id) return fail('Réservé à l’hôte.', 403);
      const target = typeof body.to === 'string' ? members.find(m => m.id === body.to) : null;
      if (!target || target.id === sender.id) return fail('Participant introuvable.', 404);
      if (action === 'mute') {
        await enqueue(target.connection_id, { v: 1, type: 'host.mute', payload: { roomId: room } });
      } else {
        await store().delete(memberKey(room, target.id));
        await enqueue(target.connection_id, { v: 1, type: 'host.kick', payload: { roomId: room } });
        await notifyRoom(room, { kind: 'leave', id: target.id, hostId: sender.id });
      }
      return success({ ok: true });
    }
    return fail('Action de réunion inconnue.', 404);
  } catch (error) {
    console.error('Netlify meeting API:', error);
    return fail('Erreur temporaire du service de réunion.', 500);
  }
}

export const config: Config = { path: '/api/*' };
