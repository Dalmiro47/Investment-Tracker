
export type Cashflow = { date: Date; amount: number }; // outflow = -, inflow = +

/** Newton-Raphson XIRR; returns annualized rate (e.g., 0.082 = 8.2%) */
export function xirr(cashflows: Cashflow[], guess = 0.1): number | null {
  if (!cashflows.length) return null;
  const msInYear = 365.0; // we’ll divide by 365 later using actual days

  const f = (r: number) => cashflows.reduce((acc, cf) => {
    const t = (cf.date.getTime() - cashflows[0].date.getTime()) / (1000 * 60 * 60 * 24); // days
    return acc + cf.amount / Math.pow(1 + r, t / msInYear);
  }, 0);

  const df = (r: number) => cashflows.reduce((acc, cf) => {
    const t = (cf.date.getTime() - cashflows[0].date.getTime()) / (1000 * 60 * 60 * 24);
    return acc + (-t / msInYear) * cf.amount / Math.pow(1 + r, 1 + t / msInYear);
  }, 0);

  let rate = guess;
  for (let i = 0; i < 50; i++) {
    const y = f(rate);
    const dy = df(rate);
    if (Math.abs(dy) < 1e-12) break;
    const newRate = rate - y / dy;
    if (!isFinite(newRate)) break;
    if (Math.abs(newRate - rate) < 1e-10) return newRate;
    rate = newRate;
  }
  return isFinite(rate) ? rate : null;
}
