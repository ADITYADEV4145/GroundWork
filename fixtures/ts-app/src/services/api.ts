import { formatDate, DAY_MS } from '@/utils/date';
import * as text from '../utils/text';

export const API_URL = 'https://api.example.com/v2';
const CONFIG_KEY = 'services.api.timeout';

export class ApiClient {
  private token: string | null = null;

  constructor(private readonly base: string, timeout?: number) {}

  static create(): ApiClient {
    return new ApiClient(API_URL);
  }

  async get(path: string): Promise<string> {
    const stamp = formatDate(new Date(Date.now() - DAY_MS));
    return this.request('GET', `${this.base}${path}?d=${stamp}`);
  }

  private request(method: string, url: string, body?: unknown): Promise<string> {
    const key = process.env.API_TOKEN ?? '';
    return fetch(url, { method, headers: { key, cfg: CONFIG_KEY } }).then((r) => r.text());
  }

  label(name: string): string {
    return text.slug(name);
  }
}
