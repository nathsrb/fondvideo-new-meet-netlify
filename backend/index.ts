import { router, json, error, db, ws, secrets } from '@appdeploy/sdk';
import {
  notifySubscribers,
  realtimeSubscriptionRoutes,
} from './realtime-subscribers';

const validRoom = (v: string) => /^[a-z2-9]{12}$/.test(v);
const tableFor = (room: string) => 'meet_' + room;
type Member = {
  id: string;
  name: string;
  connection_id: string;
  joined_at: number;
};
function okRoom(room: string) {
  return validRoom(room) ? null : error('Invalid room ID', 400);
}
async function getMembers(room: string) {
  const { items } = await db.list<Member>(tableFor(room), { limit: 24 });
  return items.sort((a,b)=>a.joined_at-b.joined_at || a.id.localeCompare(b.id));
}

export const handler = router({
  'GET /api/_healthcheck': [async () => json({ message: 'Success' })],

  // Google OAuth client ID is public. The app owner configures it once in AppDeploy.
  'GET /api/drive/config': [async () => {
    try {
      const names=await secrets.listSecretNames();
      if(!names.includes('GOOGLE_OAUTH_CLIENT_ID'))return json({configured:false});
      const clientId=await secrets.readSecret('GOOGLE_OAUTH_CLIENT_ID');
      const valid=clientId.trim().endsWith('.apps.googleusercontent.com');
      return json(valid?{configured:true,clientId:clientId.trim()}:{configured:false});
    } catch {
      return json({configured:false});
    }
  }],

  'GET /api/rooms/:room': [
    async ({ params }) => {
      const invalid = okRoom(params.room);
      if (invalid) return invalid;
      const members = await getMembers(params.room);
      return json({ members: members.map(m => ({ id: m.id, name: m.name })), hostId:members[0]?.id||null });
    },
  ],

  'POST /api/rooms/:room/join': [
    async ({ params, body }) => {
      const invalid = okRoom(params.room);
      if (invalid) return invalid;
      const { peer_id, connection_id, name } = (body || {}) as Record<
        string,
        string
      >;
      if (
        !peer_id ||
        !/^[0-9a-f-]{36}$/i.test(peer_id) ||
        !connection_id ||
        !name?.trim() ||
        name.length > 40
      )
        return error('Invalid participant', 400);
      const members = await getMembers(params.room);
      if (members.length >= 6)
        return error('This prototype supports up to 6 participants', 409);
      const [added] = await db.tx.add(tableFor(params.room), [
        {
          id: peer_id,
          name: name.trim(),
          connection_id,
          joined_at: Date.now(),
        },
      ]);
      if (!added) return error('This participant is already connected', 409);
      await notifySubscribers(
        'room',
        params.room,
        { kind: 'join', member: { id: peer_id, name: name.trim() }, hostId: members[0]?.id||peer_id },
        connection_id
      );
      return json({ members: members.map(m => ({ id: m.id, name: m.name })), hostId:members[0]?.id||peer_id });
    },
  ],

  'POST /api/rooms/:room/leave': [
    async ({ params, body }) => {
      const invalid = okRoom(params.room);
      if (invalid) return invalid;
      const { peer_id } = (body || {}) as Record<string, string>;
      if (!peer_id || !/^[0-9a-f-]{36}$/i.test(peer_id))
        return error('Invalid participant', 400);
      await db.delete(tableFor(params.room), [peer_id]);
      const remaining=await getMembers(params.room);
      await notifySubscribers('room', params.room, {kind:'leave',id:peer_id,hostId:remaining[0]?.id||null});
      return json({ ok: true });
    },
  ],

  'POST /api/rooms/:room/signal': [
    async ({ params, body }) => {
      const invalid = okRoom(params.room);
      if (invalid) return invalid;
      const { from, to, signal } = (body || {}) as {
        from?: string;
        to?: string;
        signal?: any;
      };
      if (
        !from ||
        !to ||
        !signal ||
        !['offer', 'answer', 'candidate'].includes(signal.type)
      )
        return error('Invalid signal', 400);
      if (JSON.stringify(signal).length > 120000)
        return error('Signal too large', 413);
      const [sender, recipient] = await db.get<Member>(tableFor(params.room), [
        from,
        to,
      ]);
      if (!sender || !recipient) return error('Participant not found', 404);
      await ws.send([recipient.connection_id], {
        v: 1,
        type: 'rtc.signal',
        payload: { roomId: params.room, from, signal },
      });
      return json({ ok: true });
    },
  ],

  'POST /api/rooms/:room/event': [
    async ({ params, body }) => {
      const invalid = okRoom(params.room);
      if (invalid) return invalid;
      const { from, name, kind, text, active, ts } = (body || {}) as Record<
        string,
        any
      >;
      if (!from || !['chat', 'recording', 'screen'].includes(kind))
        return error('Invalid event', 400);
      const [sender] = await db.get<Member>(tableFor(params.room), [from]);
      if (!sender) return error('Participant not found', 404);
      if (
        kind === 'chat' &&
        (typeof text !== 'string' || text.length < 1 || text.length > 2000)
      )
        return error('Invalid message', 400);
      await notifySubscribers(
        'room',
        params.room,
        kind === 'chat'
          ? {
              kind,
              from,
              name: sender.name,
              text,
              ts: Number(ts) || Date.now(),
            }
          : { kind, from, active: Boolean(active) },
        sender.connection_id
      );
      return json({ ok: true });
    },
  ],

  'POST /api/rooms/:room/mute': [
    async ({ params, body }) => {
      const invalid=okRoom(params.room);
      if(invalid)return invalid;
      const {from,to}=(body||{}) as Record<string,string>;
      const members=await getMembers(params.room);
      if(!members.length || members[0].id!==from)return error('Only host can mute',403);
      const target=members.find(m=>m.id===to);
      if(!target || to===from)return error('Unknown participant',404);
      await ws.send([target.connection_id],{v:1,type:'host.mute',payload:{roomId:params.room}});
      return json({ok:true});
    }
  ],
  'POST /api/rooms/:room/kick': [
    async ({ params, body }) => {
      const invalid=okRoom(params.room);
      if(invalid)return invalid;
      const {from,to}=(body||{}) as Record<string,string>;
      const members=await getMembers(params.room);
      if(!members.length || members[0].id!==from)return error('Only host can remove',403);
      const target=members.find(m=>m.id===to);
      if(!target || to===from)return error('Unknown participant',404);
      await db.delete(tableFor(params.room),[to]);
      await ws.send([target.connection_id],{v:1,type:'host.kick',payload:{roomId:params.room}});
      await notifySubscribers('room',params.room,{kind:'leave',id:to,hostId:members[0].id});
      return json({ok:true});
    }
  ],
  ...realtimeSubscriptionRoutes,
});
