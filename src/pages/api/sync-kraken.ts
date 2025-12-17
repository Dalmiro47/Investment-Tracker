import type { NextApiRequest, NextApiResponse } from 'next';
import { syncKrakenFutures } from '@/app/actions/kraken-sync';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = (req.method === 'POST' ? req.body?.userId : req.query?.userId) || '';
  console.log('/api/sync-kraken called, userId=', userId);

  try {
    const result = await syncKrakenFutures(String(userId));
    res.status(result.ok ? 200 : 500).json(result);
  } catch (err: any) {
    console.error('Error en API /api/sync-kraken:', err);
    res.status(500).json({ ok: false, message: String(err?.message ?? err) });
  }
}
