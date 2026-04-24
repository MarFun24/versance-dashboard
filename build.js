// Versance Dashboard Build Script
// Fetches HubSpot sequence engagement + n8n WF-D stats, bakes into static HTML
// Run by Vercel on each deploy. Triggered daily by GitHub Action via Vercel deploy hook.

import fs from 'fs/promises';

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
const WFD_WEBHOOK = process.env.WFD_WEBHOOK || 'https://mfunston.app.n8n.cloud/webhook/versance-reporting';
const SEQUENCE_ID = process.env.SEQUENCE_ID || '303463253';
const PORTAL_ID = process.env.PORTAL_ID || '45239542';
const CUTOFF_ISO = process.env.CUTOFF_ISO || '2026-04-20T00:00:00Z';

if (!HUBSPOT_TOKEN) {
  console.error('FATAL: HUBSPOT_TOKEN env var is required');
  process.exit(1);
}

async function fetchContacts() {
  const res = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: 'hs_latest_sequence_enrolled', operator: 'EQ', value: SEQUENCE_ID }] }],
      properties: [
        'email','firstname','lastname','company',
        'hs_latest_sequence_enrolled_date','hs_latest_sequence_ended_date','hs_sequences_is_enrolled',
        'hs_sales_email_last_opened','hs_sales_email_last_clicked','hs_sales_email_last_replied',
        'num_associated_deals','hubspot_owner_id'
      ],
      limit: 100,
      sorts: [{ propertyName: 'hs_latest_sequence_enrolled_date', direction: 'DESCENDING' }]
    })
  });
  if (!res.ok) {
    throw new Error(`HubSpot ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return data.results || [];
}

async function fetchN8nStats() {
  try {
    const res = await fetch(WFD_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
    const bodyText = await res.text();
    if (!res.ok) {
      console.warn(`WF-D returned ${res.status}. Body (first 500 chars): ${bodyText.slice(0, 500)}`);
      return null;
    }
    let parsed;
    try {
      parsed = JSON.parse(bodyText);
    } catch (e) {
      console.warn(`WF-D returned non-JSON response (${bodyText.length} bytes). First 500 chars: ${bodyText.slice(0, 500)}`);
      return null;
    }
    if (Array.isArray(parsed)) {
      if (parsed.length === 1 && parsed[0] && typeof parsed[0] === 'object') {
        console.log('  WF-D returned an array-wrapped object, unwrapping');
        parsed = parsed[0];
      } else {
        console.warn(`WF-D returned an array of length ${parsed.length}; expected an object. Using null.`);
        return null;
      }
    }
    console.log(`  WF-D payload keys: ${Object.keys(parsed || {}).join(', ') || '(none)'}`);
    if (parsed && Array.isArray(parsed.contact_engagement)) {
      console.log(`  WF-D contact_engagement entries: ${parsed.contact_engagement.length}`);
    } else {
      console.log('  WF-D contact_engagement: missing or not an array');
    }
    if (parsed && Array.isArray(parsed.drop_reasons_today)) {
      console.log(`  WF-D drop_reasons_today entries: ${parsed.drop_reasons_today.length}`);
    } else {
      console.log('  WF-D drop_reasons_today: missing or not an array');
    }
    return parsed;
  } catch (e) {
    console.warn('WF-D fetch failed, continuing without n8n stats:', e.message);
    return null;
  }
}

function slimContacts(contacts) {
  return contacts.map(c => ({
    id: c.id,
    properties: {
      email: c.properties.email || '',
      firstname: c.properties.firstname || '',
      lastname: c.properties.lastname || '',
      company: c.properties.company || '',
      hs_latest_sequence_enrolled_date: c.properties.hs_latest_sequence_enrolled_date || null,
      hs_latest_sequence_ended_date: c.properties.hs_latest_sequence_ended_date || null,
      hs_sequences_is_enrolled: c.properties.hs_sequences_is_enrolled || 'false',
      hs_sales_email_last_opened: c.properties.hs_sales_email_last_opened || null,
      hs_sales_email_last_clicked: c.properties.hs_sales_email_last_clicked || null,
      hs_sales_email_last_replied: c.properties.hs_sales_email_last_replied || null,
      num_associated_deals: c.properties.num_associated_deals || '0',
      hubspot_owner_id: c.properties.hubspot_owner_id || ''
    }
  }));
}

function safeJson(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

async function main() {
  console.log(`[${new Date().toISOString()}] Versance dashboard build starting`);

  console.log('  Fetching HubSpot contacts in sequence', SEQUENCE_ID);
  const contacts = await fetchContacts();
  console.log(`  Got ${contacts.length} contacts`);

  console.log('  Fetching n8n WF-D stats');
  const n8nStats = await fetchN8nStats();
  console.log(`  ${n8nStats ? 'Got WF-D stats' : 'WF-D unavailable, panel will show fallback'}`);

  const template = await fs.readFile('template.html', 'utf-8');
  const generatedAt = new Date().toISOString();

  const html = template
    .replace('"__CONTACTS_JSON__"', safeJson(slimContacts(contacts)))
    .replace('"__N8N_STATS_JSON__"', safeJson(n8nStats))
    .replace('"__GENERATED_AT__"', JSON.stringify(generatedAt))
    .replace('"__CUTOFF_ISO__"', JSON.stringify(CUTOFF_ISO))
    .replace('"__PORTAL_ID__"', JSON.stringify(PORTAL_ID))
    .replace('"__SEQUENCE_ID__"', JSON.stringify(SEQUENCE_ID));

  await fs.mkdir('dist', { recursive: true });
  await fs.writeFile('dist/index.html', html);
  console.log('  Wrote dist/index.html');
  console.log(`[${new Date().toISOString()}] Build complete`);
}

main().catch(e => {
  console.error('BUILD FAILED:', e);
  process.exit(1);
});
