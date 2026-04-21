/**
 * ML Categorization — keyword fallback + Hugging Face + permanent cache
 *
 * Priority chain:
 * 1. Redis cache (permanent) — identical merchants always same category
 * 2. Keyword rules — zero API calls, <1ms, ~80% accuracy for common merchants
 * 3. Hugging Face Inference API (free: 30k chars/month) — higher accuracy
 * 4. Default fallback: 'Outros'
 *
 * Cost analysis at 1k users × 10 tx/day = 10k tx/day:
 * - Cache hit rate ~60% (repeat merchants) → 4k new categories/day
 * - HuggingFace: 4k × ~50 chars = 200k chars/day → needs paid plan
 * - Keyword rules cover ~70% → HF only gets ~1.2k calls/day → stays free
 */

import { redis } from './redis';
import { cacheKey, TTL } from './cache';

// ─── Category definitions ─────────────────────────────────────────────────────

export type Category =
  | 'eatingOut'
  | 'groceries'
  | 'transport'
  | 'health'
  | 'education'
  | 'leisure'
  | 'services'
  | 'home'
  | 'income'
  | 'others';

interface CategoryRule {
  keywords: string[];
  category: Category;
}

// ─── Keyword rules (Brazilian + international merchants) ──────────────────────
// Ordered by specificity — first match wins

const RULES: CategoryRule[] = [
  // Income indicators
  { keywords: ['salário', 'salary', 'pagamento', 'payment received', 'pix recebido', 'transferência recebida', 'ted recebida', 'reembolso', 'rendimento', 'dividendo', 'cashback'], category: 'income' },

  // Eating out
  { keywords: ['ifood', 'rappi', 'uber eats', 'mcdonalds', 'mc donald', 'burger king', 'subway', 'starbucks', 'bob\'s', 'habib', 'pizza', 'sushi', 'churrascaria', 'padaria', 'bakery', 'restaurante', 'bar ', 'lanchonete', 'café', 'cafeteria', 'kfc', 'dominos', 'domino\'s', 'outback', 'spoleto', 'madero', 'rei do mate', 'bistrô', 'taverna', 'açaí', 'sorveteria', 'ice cream', 'food delivery', 'delivery'], category: 'eatingOut' },

  // Groceries
  { keywords: ['carrefour', 'extra', 'assaí', 'atacadão', 'pão de açúcar', 'walmart', 'makro', 'cia brasileira', 'mercadão', 'supermercado', 'hortifruti', 'feira', 'sacolão', 'aldi', 'lidl', 'costco', 'whole foods', 'kroger', 'trader joe', 'mercado livre', 'magazine luiza', 'americanas', 'shopee', 'aliexpress', 'açougue', 'peixaria', 'padaria', 'mercearia'], category: 'groceries' },

  // Transport
  { keywords: ['uber', 'lyft', '99app', '99 pop', 'cabify', 'bla bla car', 'indriver', 'taxi', 'metrô', 'metro', 'sptrans', 'ônibus', 'onibus', 'brt', 'passagem', 'combustível', 'gasolina', 'etanol', 'posto', 'shell', 'petrobras', 'br distribuidora', 'ipiranga', 'ale combustíveis', 'parking', 'estacionamento', 'multa', 'detran', 'rota das bandeiras', 'autoban', 'cartão sem parar', 'veloe', 'fleetcard', 'bom', 'rodoviária', 'passagem aérea', 'gol', 'latam', 'azul linhas', 'voepass', 'tam', 'airbnb', 'booking', 'hotel', 'pousada', 'hostel'], category: 'transport' },

  // Health
  { keywords: ['farmácia', 'farmacia', 'drogasil', 'droga raia', 'ultrafarma', 'panvel', 'nissei', 'pacheco', 'boa esperança', 'ultragenix', 'hospital', 'clínica', 'clinica', 'dentista', 'ortodontia', 'médico', 'medico', 'plano de saúde', 'amil', 'unimed', 'bradesco saúde', 'sulamerica', 'hapvida', 'nossa saúde', 'laboratorio', 'laboratório', 'exame', 'psicólogo', 'psiquiatra', 'academia', 'gym', 'smart fit', 'bluefit', 'bodytech', 'fitness', 'pilates', 'yoga', 'crossfit', 'natação', 'nutrella', 'whey', 'suplemento', 'vitamina', 'farmavida'], category: 'health' },

  // Education
  { keywords: ['escola', 'colégio', 'universidade', 'faculdade', 'usp', 'unicamp', 'unesp', 'puc', 'mackenzie', 'senai', 'sebrae', 'curso', 'udemy', 'coursera', 'alura', 'dio', 'rocketseat', 'livro', 'livraria', 'saraiva', 'fnac', 'amazon books', 'kindle', 'mensalidade', 'material escolar', 'papelaria', 'inglês', 'espanhol', 'idioma', 'byschool', 'wizard', 'fisk', 'cultura inglesa', 'ccaa', 'berlitz'], category: 'education' },

  // Leisure & Entertainment
  { keywords: ['netflix', 'spotify', 'amazon prime', 'disney', 'hbo', 'globoplay', 'paramount', 'apple tv', 'crunchyroll', 'twitch', 'youtube premium', 'deezer', 'tidal', 'steam', 'playstation', 'xbox', 'nintendo', 'cinema', 'ingresso', 'teatro', 'show', 'festival', 'parque', 'museu', 'evento', 'sympla', 'ticketmaster', 'livenow', 'clubes', 'esporte clube', 'jogo', 'game'], category: 'leisure' },

  // Services & Utilities
  { keywords: ['light ', 'enel ', 'cemig', 'copel', 'celpe', 'cosern', 'celesc', 'energisa', 'sabesp', 'cedae', 'sanepar', 'caesb', 'embasa', 'telecom', 'vivo', 'claro', 'tim', 'oi ', 'net claro', 'algar', 'nextel', 'sercomtel', 'internet', 'banda larga', 'seguro', 'porto seguro', 'sulamérica', 'bradesco seguros', 'mapfre', 'allianz', 'hdi', 'tokio marine', 'caixa seguradora', 'advocacia', 'cartório', 'imposto', 'darf', 'tributo', 'ipva', 'iptu', 'receita federal', 'prefeitura', 'gov.br', 'assinatura', 'mensalidade', 'cobrança recorrente', 'débito automático'], category: 'services' },

  // Home
  { keywords: ['leroy merlin', 'lojas americanas', 'tok&stok', 'mobly', 'etna', 'ikea', 'casas bahia', 'magazine', 'extra eletro', 'fast shop', 'ponto frio', 'kabum', 'buscape', 'zoom', 'shoptime', 'telhanorte', 'sodimac', 'ferragemns', 'ferragens', 'material de construção', 'tinta', 'aluguel', 'condomínio', 'síndico', 'portaria', 'imóvel', 'iptu', 'água', 'gás', 'botijão', 'ultragaz', 'liquigás', 'supergasbras', 'copa energia', 'comgás', 'naturgy'], category: 'home' },
];

// ─── Keyword matching ─────────────────────────────────────────────────────────

function matchKeywords(merchantName: string, description?: string): Category | null {
  const text = `${merchantName} ${description || ''}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  for (const rule of RULES) {
    for (const keyword of rule.keywords) {
      const normalized = keyword.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (text.includes(normalized)) {
        return rule.category;
      }
    }
  }
  return null;
}

// ─── Hugging Face Inference API ───────────────────────────────────────────────

const HF_API_URL = 'https://api-inference.huggingface.co/models/facebook/bart-large-mnli';
const HF_CATEGORIES = ['eating out', 'groceries', 'transport', 'health', 'education', 'leisure', 'utilities', 'home', 'income', 'other'];

const HF_LABEL_MAP: Record<string, Category> = {
  'eating out': 'eatingOut',
  'groceries': 'groceries',
  'transport': 'transport',
  'health': 'health',
  'education': 'education',
  'leisure': 'leisure',
  'utilities': 'services',
  'home': 'home',
  'income': 'income',
  'other': 'others',
};

async function classifyWithHuggingFace(merchantName: string): Promise<Category | null> {
  const hfToken = process.env.HUGGINGFACE_API_TOKEN;
  if (!hfToken) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout

    const res = await fetch(HF_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${hfToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: merchantName,
        parameters: { candidate_labels: HF_CATEGORIES },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) return null;

    const data = await res.json();
    const topLabel: string = data.labels?.[0];
    return HF_LABEL_MAP[topLabel] ?? 'others';
  } catch {
    return null;
  }
}

// ─── Main categorization function ─────────────────────────────────────────────

export async function categorizeTransaction(
  merchantName: string,
  description?: string,
  transactionType?: string,
): Promise<Category> {
  // 0. If it's income-type transaction, short-circuit
  if (transactionType === 'income') return 'income';

  // 1. Check permanent cache
  const key = cacheKey.mlPrediction(merchantName);
  try {
    const cached = await redis.get<Category>(key);
    if (cached) return cached;
  } catch {}

  // 2. Keyword rules (fast path, ~80% hit rate)
  const keywordResult = matchKeywords(merchantName, description);
  if (keywordResult) {
    // Cache permanently — same merchant always same category
    await redis.set(key, keywordResult).catch(() => {});
    return keywordResult;
  }

  // 3. Hugging Face (async, 30k chars/month free)
  const hfResult = await classifyWithHuggingFace(merchantName);
  if (hfResult) {
    await redis.set(key, hfResult).catch(() => {});
    return hfResult;
  }

  // 4. Default fallback
  return 'others';
}

// ─── Batch categorization (for import jobs) ───────────────────────────────────

export async function categorizeBatch(
  transactions: Array<{ merchantName: string; description?: string; type?: string }>,
): Promise<Category[]> {
  // Run in parallel but limit concurrency to avoid Redis/HF rate limits
  const BATCH_SIZE = 5;
  const results: Category[] = [];

  for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
    const batch = transactions.slice(i, i + BATCH_SIZE);
    const categories = await Promise.all(
      batch.map(tx => categorizeTransaction(tx.merchantName, tx.description, tx.type)),
    );
    results.push(...categories);
  }

  return results;
}
