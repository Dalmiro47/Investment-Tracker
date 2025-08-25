
import { format, parseISO, startOfMonth } from 'date-fns';

/**
 * Safely gets the canonical start month ('YYYY-MM') for a plan.
 * It prefers the explicit `startMonth` field if it exists and is valid.
 * Otherwise, it derives a timezone-safe month from the `startDate` string,
 * providing backward compatibility for older plan data.
 */
export const getStartMonth = (plan: { startMonth?: string; startDate: string }): string => {
  if (plan.startMonth && /^\d{4}-\d{2}$/.test(plan.startMonth)) {
    return plan.startMonth;
  }
  // Fallback for older plans: derive from startDate in a TZ-safe way
  return format(startOfMonth(parseISO(plan.startDate)), 'yyyy-MM');
};
