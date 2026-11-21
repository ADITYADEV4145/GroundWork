import { ApiClient } from './services/api';
import { joinParts, sleep, formatDate, padNumber } from '@/utils';
import anon from './utils/anon';
import Toolbar, { Button } from './components/Button';

export async function main(): Promise<void> {
  const client = ApiClient.create();
  await client.get('/users');
  await sleep(10);
  console.log(joinParts('-', '1', '2'), formatDate(new Date(), true));
  Toolbar();
  Button({ label: 'x' });
  padNumber(7);
  anon();
}
