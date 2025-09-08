export const toSlug = (s: string) =>
  s.toLowerCase()
   .normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
   .replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');

function shortHash(input: string) {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) | 0;
  return Math.abs(h).toString(16).slice(0,4);
}

export function buildInvestmentId(uId: string, inv: {
  name?: string; ticker?: string; type?: string; purchaseDate?: string | Date; createdAt?: any;
}) {
  const base = inv.ticker || inv.name || inv.type || 'asset';
  const dateStr = typeof inv.purchaseDate === 'string' 
    ? inv.purchaseDate.slice(0,10) 
    : inv.purchaseDate instanceof Date 
    ? inv.purchaseDate.toISOString().slice(0,10)
    : (inv.createdAt?.toDate?.()?.toISOString()?.slice(0,10) ?? 'unknown');
    
  const slug = toSlug(base);
  const sh = shortHash(`${uId}|${base}|${dateStr}`);
  return `${slug}-${dateStr}-${sh}`;
}
