import { kv } from '@vercel/kv';

const INDEX_KEY = 'engagement:index';
const HASH_KEY = (id) => `engagement:contact:${id}`;
const EVENT_KEY = (eventId) => `engagement:event:${eventId}`;
const EVENT_TTL_SECONDS = 7 * 24 * 60 * 60;

const VALID_TYPES = new Set(['opens', 'clicks', 'replies']);

function isKvConfigured() {
  return !!(process.env.KV_REST_API_URL || process.env.KV_URL);
}

export async function incrementEngagement(contactId, type) {
  if (!VALID_TYPES.has(type)) throw new Error(`invalid engagement type: ${type}`);
  const id = String(contactId);
  await Promise.all([
    kv.hincrby(HASH_KEY(id), type, 1),
    kv.sadd(INDEX_KEY, id)
  ]);
}

export async function claimEventOnce(eventId) {
  if (eventId == null) return true;
  const result = await kv.set(EVENT_KEY(eventId), '1', { nx: true, ex: EVENT_TTL_SECONDS });
  return result === 'OK';
}

export async function getAllEngagement() {
  if (!isKvConfigured()) {
    console.warn('  Vercel KV not configured (KV_REST_API_URL missing) — returning empty engagement');
    return [];
  }
  const ids = await kv.smembers(INDEX_KEY);
  if (!ids || !ids.length) return [];
  const hashes = await Promise.all(ids.map(id => kv.hgetall(HASH_KEY(id))));
  return ids
    .map((id, i) => {
      const h = hashes[i] || {};
      return {
        contact_id: String(id),
        opens: Math.max(0, parseInt(h.opens, 10) || 0),
        clicks: Math.max(0, parseInt(h.clicks, 10) || 0),
        replies: Math.max(0, parseInt(h.replies, 10) || 0)
      };
    })
    .filter(r => r.opens || r.clicks || r.replies);
}

export async function seedEngagement(contactId, { opens = 0, clicks = 0, replies = 0 } = {}) {
  const id = String(contactId);
  const fields = {};
  if (opens) fields.opens = opens;
  if (clicks) fields.clicks = clicks;
  if (replies) fields.replies = replies;
  if (!Object.keys(fields).length) return;
  await Promise.all([
    kv.hset(HASH_KEY(id), fields),
    kv.sadd(INDEX_KEY, id)
  ]);
}
