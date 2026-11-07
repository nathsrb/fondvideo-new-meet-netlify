#!/usr/bin/env node
/**
 * Smoke test for FondVidéo New Meet's Netlify signalling layer.
 * Explicitly restricted to Netlify deploy previews; NEVER runs against production.
 *
 * Usage: MEET_BASE_URL=https://deploy-preview-N--fondvideo-new-meet-preview.netlify.app npm run test:meet-preview
 *
 * This validates API signalling and moderation, NOT actual camera/microphone or TURN/WebRTC media.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const base = process.env.MEET_BASE_URL || '';
const address = new URL(base || 'https://invalid.example/');
const allowedPreview = /^https:\/\/(?:deploy-preview-\d+|[0-9a-f]{24})--fondvideo-new-meet-preview\.netlify\.app$/i;
if (!allowedPreview.test(address.origin)) {
  console.error('Refus : MEET_BASE_URL doit être une prévisualisation Netlify, jamais la production.');
  process.exit(2);
}
const room = Array.from({ length: 12 }, () => 'abcdefghijkmnopqrstuvwxyz23456789'[Math.floor(Math.random() * 32)]).join('');
const participants = [
  { peer_id: randomUUID(), connection_id: randomUUID(), name: 'Test A', token: null },
  { peer_id: randomUUID(), connection_id: randomUUID(), name: 'Test B', token: null },
];
async function call(path, method = 'GET', payload) {
  const response = await fetch(address.origin + path, {
    method,
    headers: { 'Accept': 'application/json', ...(payload ? { 'Content-Type': 'application/json' } : {}) },
    body: payload ? JSON.stringify(payload) : undefined,
    signal: AbortSignal.timeout(12000),
    cache: 'no-store',
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch {
    throw new Error(path + ': réponse non JSON (' + response.status + '): ' + text.slice(0, 170));
  }
  if (!response.ok) throw new Error(path + ': ' + response.status + ' ' + (data.error || text.slice(0, 170)));
  return data;
}
const route = '/api/rooms/' + room;
async function mutation(action, sender, data = {}) {
  return call(route + '/' + action, 'POST', {
    from: sender.peer_id,
    peer_id: sender.peer_id,
    session_token: sender.token,
    ...data,
  });
}
async function events(connection_id, after = '') {
  return call('/api/ws/events?' + new URLSearchParams({ connection_id, after }));
}
async function waitEvent(connection_id, predicate) {
  let cursor = '';
  for (let attempt = 0; attempt < 12; attempt++) {
    const result = await events(connection_id, cursor);
    for (const event of result.events || []) {
      cursor = event.id;
      if (predicate(event.message)) return event.message;
    }
    await new Promise(resolve => setTimeout(resolve, 450));
  }
  throw new Error('Événement de signalisation non reçu dans le délai prévu.');
}
try {
  const health = await call('/api/_healthcheck');
  assert.equal(health.message, 'Success');
  assert.equal(health.transport, 'netlify-preview-polling');
  console.log('✓ Santé du backend Netlify');

  for (const user of participants) {
    const joined = await mutation('join', user, { connection_id: user.connection_id, name: user.name });
    assert.equal(typeof joined.sessionToken, 'string');
    user.token = joined.sessionToken;
  }
  const members = await call(route);
  assert.equal(members.members.length, 2);
  assert.equal(members.hostId, participants[0].peer_id);
  console.log('✓ Deux participants et attribution de l’hôte');

  const a = participants[0], b = participants[1];
  await mutation('event', a, { kind: 'chat', text: 'Message test', ts: Date.now() });
  await waitEvent(b.connection_id, msg => msg.type === 'entity.update' && msg.payload?.data?.kind === 'chat' && msg.payload?.data?.text === 'Message test');
  console.log('✓ Discussion et réception de l’événement');

  await mutation('signal', b, { to: a.peer_id, signal: { type: 'candidate', candidate: { candidate: 'test-candidate' } } });
  await waitEvent(a.connection_id, msg => msg.type === 'rtc.signal' && msg.payload?.from === b.peer_id);
  console.log('✓ Transport de signalisation WebRTC');

  await mutation('mute', a, { to: b.peer_id });
  await waitEvent(b.connection_id, msg => msg.type === 'host.mute');
  console.log('✓ Modération par l’hôte');

  await mutation('leave', b);
  assert.equal((await call(route)).members.length, 1);
  await mutation('leave', a);
  console.log('✓ Sortie de réunion et nettoyage des participants');
  console.log('API de réunion : tests de base réussis (médias WebRTC non testés).');
} catch (error) {
  console.error('ÉCHEC : ' + (error?.message || String(error)));
  process.exitCode = 1;
} finally {
  for (const user of participants) {
    if (user.token) await mutation('leave', user).catch(() => {});
  }
}
