
import axios from 'axios';

export const http = axios.create({
  timeout: 10_000,
  headers: { 'Accept': 'application/json' },
});

export async function getWithRetry<T>(url: string, tries = 2): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < tries; i++) {
    try { 
        const response = await http.get<T>(url);
        return response.data;
    } 
    catch (e) { 
        lastErr = e; 
        if (i < tries - 1) {
            await new Promise(res => setTimeout(res, 500 * (i + 1))); // exponential backoff
        }
    }
  }
  throw lastErr;
}
