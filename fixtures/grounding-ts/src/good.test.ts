import { UserStore } from './lib/users';

const fake = UserStore as unknown as { mocked(): void };
UserStore.mocked();
void fake;
