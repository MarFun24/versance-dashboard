import crypto from 'node:crypto';
import { incrementEngagement, claimEventOnce } from '../lib/engagement-store.js';

const SECRET = process.env.HUBSPOT_WEBHOOK_SECRET;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

const PROPERTY_TO_TYPE = {
  hs_sales_email_last_opened: 'opens',
  hs_sales_email_last_clicked: 'clicks',
  hs_sales_email_last_replied: 'replies'
};
const VALID_WORKFLOW_TYPES = new Set(['opens', 'clicks', 'replies']);

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
  } catch {
    return res.status(400).json({ error: 'could not read body' });
  }

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: 'invalid JSON body' });
  }

  const typeParam = typeof req.query?.type === 'string' ? req.query.type.toLowerCase() : '';
  const urlKey = typeof req.query?.key === 'string' ? req.query.key : '';
  const isWorkflow = !Array.isArray(body) && !!typeParam;

  if (isWorkflow) {
    if (!SECRET) {
      console.warn('hubspot-events: HUBSPOT_WEBHOOK_SECRET not set; workflow endpoint is unauthenticated');
    } else if (!timingSafeStringEqual(urlKey, SECRET)) {
      return res.status(401).json({ error: 'invalid key' });
    }
    return res.status(200).json(await processWorkflow(body, typeParam));
  }

  if (SECRET) {
    if (!verifySignature(req, rawBody)) {
      console.warn('hubspot-events: subscription signature verification failed');
      return res.status(401).json({ error: 'invalid signature' });
    }
  } else {
    console.warn('hubspot-events: HUBSPOT_WEBHOOK_SECRET not set; skipping signature check');
  }

  if (!Array.isArray(body)) {
    return res.status(400).json({ error: 'expected an array of events (subscription webhook) or a workflow payload with ?type=opens|clicks|replies' });
  }
  return res.status(200).json(await processSubscriptionEvents(body));
}

async function processSubscriptionEvents(events) {
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
      console.error(`hubspot-events: subscription event ${event.eventId} for contact ${event.objectId} failed:`, e.message);
    }
  }
  return { mode: 'subscription', processed, duplicates, skipped, errors, received: events.length };
}

async function processWorkflow(body, type) {
  if (!VALID_WORKFLOW_TYPES.has(type)) {
    return { mode: 'workflow', processed: 0, skipped: 1, errors: 0, reason: 'invalid type param' };
  }
  const contactId = body.objectId ?? body.vid ?? body['canonical-vid'] ?? body.hs_object_id ?? body.id
    ?? body.properties?.hs_object_id?.value ?? body.properties?.hs_object_id;
  if (!contactId) {
    return { mode: 'workflow', processed: 0, skipped: 1, errors: 0, reason: 'contact id not found in payload' };
  }
  const eventId = body.eventId || body.executionId || body['portal-id']
    ? `wf:${type}:${contactId}:${body.eventId || body.executionId || Date.now()}`
    : `wf:${type}:${contactId}:${Date.now()}`;
  try {
    const fresh = await claimEventOnce(eventId);
    if (!fresh) return { mode: 'workflow', processed: 0, duplicates: 1, skipped: 0, errors: 0 };
    await incrementEngagement(contactId, type);
    return { mode: 'workflow', processed: 1, duplicates: 0, skipped: 0, errors: 0, contactId: String(contactId), type };
  } catch (e) {
    console.error(`hubspot-events: workflow event for contact ${contactId} (${type}) failed:`, e.message);
    return { mode: 'workflow', processed: 0, duplicates: 0, skipped: 0, errors: 1, reason: e.message };
  }
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

function timingSafeStringEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  try { return crypto.timingSafeEqual(ab, bb); } catch { return false; }
}
