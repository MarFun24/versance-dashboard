import crypto from 'node:crypto';
import { incrementEngagement, claimEventOnce } from '../lib/engagement-store.js';

const SECRET = process.env.HUBSPOT_WEBHOOK_SECRET;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

const PROPERTY_TO_TYPE = {
  hs_sales_email_last_opened: 'opens',
  hs_sales_email_last_clicked: 'clicks',
  hs_sales_email_last_replied: 'replies'
};

export const config = {
  api: { bodyParser: false }
};

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, endpoint: 'hubspot-events', method: 'POST expected' });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch (e) {
    return res.status(400).json({ error: 'could not read body' });
  }

  if (SECRET) {
    if (!verifySignature(req, rawBody)) {
      console.warn('hubspot-events: signature verification failed');
      return res.status(401).json({ error: 'invalid signature' });
    }
  } else {
    console.warn('hubspot-events: HUBSPOT_WEBHOOK_SECRET not set, skipping signature check');
  }

  let events;
  try {
    events = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: 'invalid JSON body' });
  }
  if (!Array.isArray(events)) {
    return res.status(400).json({ error: 'expected an array of events' });
  }

  let processed = 0, duplicates = 0, skipped = 0, errors = 0;
  for (const event of events) {
    const type = PROPERTY_TO_TYPE[event && event.propertyName];
    if (!type || !event.objectId || !event.propertyValue) { skipped++; continue; }
    try {
      const fresh = await claimEventOnce(event.eventId);
      if (!fresh) { duplicates++; continue; }
      await incrementEngagement(event.objectId, type);
      processed++;
    } catch (e) {
      errors++;
      console.error(`hubspot-events: failed to process event ${event.eventId} for contact ${event.objectId}:`, e.message);
    }
  }

  return res.status(200).json({ processed, duplicates, skipped, errors, received: events.length });
}

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function verifySignature(req, rawBody) {
  const signatureHeader = req.headers['x-hubspot-signature-v3'];
  const timestamp = req.headers['x-hubspot-request-timestamp'];
  if (!signatureHeader || !timestamp) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() - ts) > MAX_CLOCK_SKEW_MS) return false;

  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  if (!host) return false;
  const uri = `${proto}://${host}${req.url}`;
  const source = `POST${uri}${rawBody}${timestamp}`;
  const expected = crypto.createHmac('sha256', SECRET).update(source).digest('base64');

  const received = String(signatureHeader);
  if (received.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
  } catch {
    return false;
  }
}
