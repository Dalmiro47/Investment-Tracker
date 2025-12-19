import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface KrakenLogForExport {
  date: string;
  asset: string;
  type: string;
  usdAmount: number;
  exchangeRate: number;
  eurAmount: number;
  bookingUid: string;
}

/**
 * Export Kraken logs to CSV format for German tax compliance
 * Uses ISO date format and standard decimal point
 */
export async function exportKrakenLogsToCSV(
  userId: string,
  year: number
): Promise<string> {
  const startOfYear = Timestamp.fromDate(new Date(`${year}-01-01T00:00:00Z`));
  const endOfYear = Timestamp.fromDate(new Date(`${year}-12-31T23:59:59Z`));

  const logsRef = collection(db, 'users', userId, 'kraken_logs');
  const q = query(
    logsRef,
    where('timestamp', '>=', startOfYear),
    where('timestamp', '<=', endOfYear)
  );

  const snapshot = await getDocs(q);
  const records: KrakenLogForExport[] = [];

  snapshot.forEach((doc) => {
    const data = doc.data();

    // Extract relevant fields for export
    const baseRecord = {
      date: new Date(data.date).toISOString().split('T')[0], // ISO date: YYYY-MM-DD
      asset: data.asset || '',
      exchangeRate: data.exchangeRate || 0,
      bookingUid: data.booking_uid || '',
    };

    // Add P&L entry if present
    if (data.realized_pnl || data.realized_pnlEur) {
      records.push({
        ...baseRecord,
        type: 'Trade',
        usdAmount: data.realized_pnl || 0,
        eurAmount: data.realizedPnlEur || 0,
      });
    }

    // Add Funding entry if present
    if (data.realized_funding || data.realizedFundingEur) {
      records.push({
        ...baseRecord,
        type: 'Funding',
        usdAmount: data.realized_funding || 0,
        eurAmount: data.realizedFundingEur || 0,
      });
    }

    // Add Fee entry if present
    if (data.fee || data.feeEur) {
      records.push({
        ...baseRecord,
        type: 'Fee',
        usdAmount: data.fee || 0,
        eurAmount: data.feeEur || 0,
      });
    }
  });

  // Sort by date ascending for chronological order
  records.sort((a, b) => a.date.localeCompare(b.date));

  // Build CSV with BOM (Byte Order Mark) for Excel UTF-8 compatibility
  const bom = '\ufeff';
  const headers = ['Date', 'Asset', 'Type', 'USD Amount', 'Exchange Rate', 'EUR Amount', 'Booking UID'];
  const csvContent = records.map((record) =>
    [
      record.date,
      record.asset,
      record.type,
      record.usdAmount.toFixed(8).replace(/\.?0+$/, ''), // Remove trailing zeros
      record.exchangeRate.toFixed(5),
      record.eurAmount.toFixed(2),
      record.bookingUid,
    ].map((field) => `"${field}"`) // Wrap in quotes for CSV safety
    .join(',')
  );

  return bom + headers.join(',') + '\n' + csvContent.join('\n');
}

/**
 * Download CSV content as file
 */
export function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}
