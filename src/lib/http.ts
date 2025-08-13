
import axios from 'axios';

export const http = axios.create({
  timeout: 10_000,
  headers: { 'Accept': 'application/json' },
});

export async function getWithRetry<T>(url: string, tries = 3): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < tries; i++) {
    try { 
        const response = await http.get<T>(url);
        return response.data;
    } 
    catch (e: any) { 
        lastErr = e;
        const status = e?.response?.status;
        if (status && status !== 429 && status >= 400 && status < 500) {
            break; // Don't retry on 4xx client errors (other than 429)
        }
        const retryAfter = Number(e?.response?.headers?.['retry-after']);
        const baseDelay = retryAfter ? retryAfter * 1000 : 500 * (i + 1);
        const jitter = Math.floor(Math.random() * 200);

        if (i < tries - 1) {
            await new Promise(res => setTimeout(res, baseDelay + jitter)); // exponential backoff with jitter
        }
    }
  }
  throw lastErr;
}
