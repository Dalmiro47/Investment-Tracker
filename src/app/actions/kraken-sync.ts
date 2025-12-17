'use server';

import crypto from 'crypto';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

// Dos URLs base distintas según el tipo de endpoint
const KRAKEN_FUTURES_TRADING_URL = 'https://futures.kraken.com/derivatives/api/v3';
const KRAKEN_FUTURES_HISTORY_URL = 'https://futures.kraken.com/api/history/v3';

// --- Tipos de Datos ---
type KrakenFuturesSyncResult = { ok: boolean; message: string; };
type KrakenFill = { symbol: string; side: 'buy' | 'sell'; quantity: number; price: number; fee: number; timestamp: number; };
// account-log tiene una estructura diferente, nos interesa 'info' y 'amount'/'funding_rate'
type KrakenAccountLog = { 
  id: number;
  date: string; 
  asset: string; 
  info: string; // Ej: "funding rate change", "realized funding"
  booking_uid: string;
  amount: number; // Funding suele venir en 'amount' o calculado
  realized_funding?: number; // A veces viene explícito
  type: string;
};

type KrakenFillsResponse = { result: string; fills: KrakenFill[]; };
type KrakenLogsResponse = { result: string; logs: KrakenAccountLog[]; }; // La API devuelve 'logs'

function buildKrakenFuturesAuthHeaders(
  apiKey: string,
  apiSecret: string,
  endpointPath: string, // El path RELATIVO exacto que se usará en la URL
  body: string = '' 
) {
  const nonce = Date.now().toString(); // Milisegundos
  const secretBuffer = Buffer.from(apiSecret, 'base64');

  // Algoritmo Futures v3: HMAC-SHA512( SHA256(postData + nonce + endpointPath), secret )
  const concatenated = (body ?? '') + nonce + endpointPath;
  const sha256Digest = crypto.createHash('sha256').update(concatenated).digest();
  const hmac = crypto.createHmac('sha512', secretBuffer).update(sha256Digest).digest('base64');

  return {
    'APIKey': apiKey,
    'Authent': hmac,
    'Nonce': nonce,
    'Content-Type': 'application/json',
  };
}

async function krakenFuturesFetch<T>(
  apiKey: string, apiSecret: string, endpoint: string, type: 'trading' | 'history'
): Promise<T> {
  // 1. Determinar URL Base y Path de Firma
  let baseUrl;
  let signaturePath;

  if (type === 'trading') {
    baseUrl = KRAKEN_FUTURES_TRADING_URL;
    // Para endpoints de trading, la doc suele indicar /api/v3/... 
    // pero la URL real lleva /derivatives. 
    // IMPORTANTE: La firma para fills suele requerir "/api/v3/fills" (sin derivatives)
    // OJO: Si falla, prueba incluir /derivatives en signaturePath.
    signaturePath = `/api/v3/${endpoint}`;
  } else {
    baseUrl = KRAKEN_FUTURES_HISTORY_URL;
    // Para history, la URL es .../api/history/v3/account-log
    // La firma suele requerir "/api/history/v3/account-log"
    signaturePath = `/api/history/v3/${endpoint}`;
  }

  const fetchUrl = `${baseUrl}/${endpoint}`;
  
  // Generar headers con el signaturePath correcto
  const headers = buildKrakenFuturesAuthHeaders(apiKey, apiSecret, signaturePath, '');

  try {
    const res = await fetch(fetchUrl, {
      method: 'GET',
      headers,
      cache: 'no-store',
    });

    const text = await res.text();
    if (!res.ok) throw new Error(`Error Kraken (${res.status}): ${text}`);

    const jsonBody: any = JSON.parse(text);
    if (jsonBody.result === 'error') throw new Error(`Error API: ${JSON.stringify(jsonBody)}`);

    return jsonBody as T;
  } catch (err: any) {
    console.error(`Fallo fetch ${endpoint}:`, err.message);
    throw err;
  }
}

export async function syncKrakenFutures(userId: string): Promise<KrakenFuturesSyncResult> {
  console.log('--- 1. Iniciando Sync para userId:', userId);
  const apiKey = process.env.KRAKEN_FUTURES_KEY;
  const apiSecret = process.env.KRAKEN_FUTURES_SECRET;

  if (!userId || !apiKey || !apiSecret) return { ok: false, message: 'Faltan credenciales' };

  try {
    // 1. Fills (Trading API)
    console.log('--- 2. Fetching Fills ---');
    const fillsRes = await krakenFuturesFetch<KrakenFillsResponse>(apiKey, apiSecret, 'fills', 'trading');
    
    // 2. Account Log (History API) - Para Funding Fees
    console.log('--- 3. Fetching Account Log (Funding) ---');
    // Usamos 'account-log' que es el endpoint correcto en History API v3
    const logsRes = await krakenFuturesFetch<KrakenLogsResponse>(apiKey, apiSecret, 'account-log', 'history');

    console.log(`--- 4. Datos recibidos. Fills: ${fillsRes.fills?.length || 0}, Logs: ${logsRes.logs?.length || 0}`);

    // 3. Procesamiento (Misma lógica, adaptada al log de Futures)
    const batch = adminDb.batch();
    const futuresCol = adminDb.collection(`users/${userId}/futures_positions`);
    const fundingMap = new Map<string, number>();

    (logsRes.logs || []).forEach((log) => {
      // Kraken Futures suele marcar el funding con info="funding rate change" o types específicos
      // Busca logs donde haya un movimiento de saldo negativo o positivo asociado a funding
      if (log.info.includes('funding') || log.type === 'funding') {
         // El asset suele venir como 'kf_ETH' o similar. Ajusta según veas los logs reales.
         // 'realized_funding' es el campo ideal si existe, sino usa amount.
         const amount = log.realized_funding || log.amount || 0;
         const symbol = log.asset; // Ojo, puede necesitar map: kf_ETH -> ETH
         
         if (amount !== 0) {
             fundingMap.set(symbol, (fundingMap.get(symbol) || 0) + amount);
         }
      }
    });

    // Guardado (Simplificado para el ejemplo)
    for (const [symbol, totalFunding] of fundingMap.entries()) {
      const ref = futuresCol.doc(symbol);
      batch.set(ref, {
        asset: symbol,
        accumulatedFunding: FieldValue.increment(totalFunding),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    await batch.commit();
    return { ok: true, message: 'Sync Completo' };

  } catch (err: any) {
    console.error('Sync error:', err);
    return { ok: false, message: err.message };
  }
}