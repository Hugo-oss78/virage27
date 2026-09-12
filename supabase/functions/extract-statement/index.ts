// MHTL Wealth — statement extraction Edge Function (pivot v2, D33-D38)
// Reference: .claude/orchestration-wealth-tracker/research/statement-scanning-extraction-implementation.md
//
// Input:  { statement_document_id: string }
// Flow:   load statement_documents row -> verify caller is a household member -> download the
//         document from Storage (service role) -> call Claude with output_config.format (structured
//         outputs) -> attach dedup tiers per transaction -> store the result on statement_documents
//         and return it to the client for the D35 correction screen. Nothing is written to
//         transactions/positions/accounts here — that only happens once the user confirms (D35).

import { createClient } from 'npm:@supabase/supabase-js@2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const EXTRACTION_MODEL = 'claude-sonnet-5';
const ESCALATION_MODEL = 'claude-opus-4-8';

const CATEGORIES = [
  'Logement',
  'Charges & Abonnements',
  'Alimentation',
  'Restaurants',
  'Transport',
  'Santé',
  'Shopping',
  'Loisirs',
  'Voyages',
  'Services',
  'Non catégorisé',
] as const;

const EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['document_type', 'statement_period', 'accounts', 'extraction_confidence'],
  properties: {
    document_type: {
      type: 'string',
      enum: ['compte_courant', 'epargne', 'pea', 'compte_titres', 'assurance_vie', 'veracash', 'placement_direct', 'autre'],
    },
    statement_period: {
      type: 'object',
      additionalProperties: false,
      required: ['start_date', 'end_date'],
      properties: {
        start_date: { type: 'string', format: 'date' },
        end_date: { type: 'string', format: 'date' },
      },
    },
    accounts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['account_label_raw', 'balance_eur', 'currency_on_document', 'transactions', 'positions'],
        properties: {
          account_label_raw: { type: 'string', description: 'Account name/number exactly as printed on the document' },
          balance_eur: { type: 'number', description: 'Closing balance, decimal EUR, comma-to-period already normalized' },
          currency_on_document: { type: 'string', description: 'ISO currency code as printed (e.g. EUR, USD)' },
          transactions: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['date', 'label_raw', 'amount_eur', 'category', 'confidence'],
              properties: {
                date: { type: 'string', format: 'date' },
                label_raw: { type: 'string', description: 'Transaction label exactly as printed, uncleaned' },
                amount_eur: { type: 'number', description: 'Signed amount: negative = debit/outflow, positive = credit/inflow' },
                category: { type: 'string', enum: [...CATEGORIES] },
                confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
              },
            },
          },
          positions: {
            type: 'array',
            description: 'For PEA/compte-titres/assurance-vie statements only; empty array otherwise',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['label_raw', 'isin', 'quantity', 'value_eur'],
              properties: {
                label_raw: { type: 'string' },
                isin: { type: ['string', 'null'] },
                quantity: { type: ['number', 'null'] },
                value_eur: { type: 'number' },
              },
            },
          },
        },
      },
    },
    extraction_confidence: {
      type: 'object',
      additionalProperties: false,
      required: ['overall', 'issues'],
      properties: {
        overall: { type: 'string', enum: ['high', 'medium', 'low'] },
        issues: { type: 'array', items: { type: 'string' } },
      },
    },
  },
} as const;

const SYSTEM_PROMPT = `Tu extrais les données d'un relevé bancaire ou financier français (bancaire, PEA, compte-titres, assurance-vie, Veracash, Placement Direct) à partir d'une image ou d'un PDF, en une seule passe structurée.

Conventions françaises à respecter impérativement :
- Séparateur décimal : la virgule ("1 234,56 €" = 1234.56). Normalise toujours vers un nombre JSON à point décimal, jamais de virgule.
- Signe des montants : si le relevé utilise deux colonnes "Débit"/"Crédit" (ou "Retrait"/"Versement") sans signe imprimé, traite toute valeur en colonne débit comme négative et toute valeur en colonne crédit comme positive. Si le signe est porté par des parenthèses ou un "-", respecte-le directement.
- Devise : lis la devise réellement imprimée pour chaque montant. Ne convertis en EUR que si nécessaire, et signale toute conversion effectuée dans extraction_confidence.issues plutôt que de deviner un taux de change silencieusement.
- Une ligne sans date ni montant est la continuation du libellé de la ligne précédente, pas une nouvelle transaction vide.
- Une ligne imprimée = une transaction ; ne tente pas de deviner des sous-transactions non visibles sur le document.
- Si le relevé fait plusieurs pages, traite-le comme un seul document (ne duplique pas un solde visible à la fois sur une page de résumé et une page de détail).

Pour chaque transaction, indique ton propre niveau de confiance ("high"/"medium"/"low") sur la lecture de cette ligne — un signal purement auto-déclaré qui sert à prioriser la relecture humaine, jamais un motif pour la sauter.`;

interface RequestBody {
  statement_document_id: string;
}

// btoa(String.fromCharCode(...bytes)) blows the call stack on multi-MB PDFs — encode in chunks instead.
function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK_SIZE = 32768;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE));
  }
  return btoa(binary);
}

function guessMediaType(path: string): { type: 'image' | 'document'; mediaType: string } {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return { type: 'document', mediaType: 'application/pdf' };
  if (ext === 'png') return { type: 'image', mediaType: 'image/png' };
  if (ext === 'webp') return { type: 'image', mediaType: 'image/webp' };
  if (ext === 'gif') return { type: 'image', mediaType: 'image/gif' };
  return { type: 'image', mediaType: 'image/jpeg' };
}

async function callClaude(base64Data: string, contentBlock: { type: string; mediaType: string }, model: string) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      output_config: { format: { type: 'json_schema', schema: EXTRACTION_SCHEMA } },
      messages: [
        {
          role: 'user',
          content: [
            contentBlock.type === 'document'
              ? { type: 'document', source: { type: 'base64', media_type: contentBlock.mediaType, data: base64Data } }
              : { type: 'image', source: { type: 'base64', media_type: contentBlock.mediaType, data: base64Data } },
            {
              type: 'text',
              text: 'Extrait ce relevé selon le schéma structuré fourni, en respectant les conventions françaises rappelées dans le system prompt.',
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Claude API error ${response.status}: ${text}`);
  }

  const data = await response.json();
  const textBlock = data.content?.find((block: { type: string }) => block.type === 'text');
  if (!textBlock) throw new Error('Claude response contained no text block');
  return JSON.parse(textBlock.text);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // userClient runs as the caller (their JWT forwarded, anon key for the gateway) so every query
  // through it is subject to the normal household RLS policies — it is the authorization check.
  // serviceClient bypasses RLS and is only used for the Storage download and the final status update.
  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  if (!body.statement_document_id) {
    return new Response(JSON.stringify({ error: 'statement_document_id is required' }), { status: 400 });
  }

  // RLS on statement_documents (is_household_member + aal2) enforces that the caller may only
  // read a row belonging to their own household — this select is the authorization check.
  const { data: doc, error: docError } = await userClient
    .from('statement_documents')
    .select('id, household_id, account_id, storage_path, status')
    .eq('id', body.statement_document_id)
    .single();

  if (docError || !doc) {
    return new Response(JSON.stringify({ error: 'Statement document not found or not accessible' }), { status: 404 });
  }

  const { data: fileBlob, error: downloadError } = await serviceClient.storage
    .from('statements')
    .download(doc.storage_path);

  if (downloadError || !fileBlob) {
    await serviceClient
      .from('statement_documents')
      .update({ status: 'failed', extraction_error: `Storage download failed: ${downloadError?.message}` })
      .eq('id', doc.id);
    return new Response(JSON.stringify({ error: 'Could not download the stored document' }), { status: 500 });
  }

  const arrayBuffer = await fileBlob.arrayBuffer();
  const base64Data = bytesToBase64(new Uint8Array(arrayBuffer));
  const { type, mediaType } = guessMediaType(doc.storage_path);

  try {
    let result = await callClaude(base64Data, { type, mediaType }, EXTRACTION_MODEL);

    // Escalate to Opus once (D34) when Sonnet 5 itself reports low confidence on the whole document.
    if (result.extraction_confidence?.overall === 'low') {
      try {
        result = await callClaude(base64Data, { type, mediaType }, ESCALATION_MODEL);
      } catch {
        // Keep the Sonnet 5 result if the escalation call itself fails — still better than nothing,
        // and extraction_confidence.overall already tells the correction screen to be cautious.
      }
    }

    // D35 dedup: tag every extracted transaction against the household's existing history.
    for (const account of result.accounts ?? []) {
      for (const tx of account.transactions ?? []) {
        const { data: matches } = await userClient.rpc('find_duplicate_transactions', {
          p_account_id: doc.account_id,
          p_date: tx.date,
          p_amount_eur: tx.amount_eur,
          p_label: tx.label_raw,
        });
        tx.dedup_status = matches && matches.length > 0
          ? (matches.some((m: { match_tier: string }) => m.match_tier === 'probable') ? 'probable' : 'possible')
          : 'none';
      }
    }

    await serviceClient
      .from('statement_documents')
      .update({
        status: 'extracted',
        extraction_raw: result,
        document_date: result.statement_period?.end_date ?? null,
      })
      .eq('id', doc.id);

    return new Response(JSON.stringify({ extraction: result }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await serviceClient
      .from('statement_documents')
      .update({ status: 'failed', extraction_error: message })
      .eq('id', doc.id);
    return new Response(JSON.stringify({ error: `Extraction failed: ${message}` }), { status: 502 });
  }
});
