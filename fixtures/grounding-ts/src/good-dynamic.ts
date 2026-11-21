import { UserStore } from './lib/users';
import * as math from './lib/math';

// Proxies and monkey-patching: members appear at runtime, so nothing here may be flagged.
const patched = UserStore as unknown as { prototype: Record<string, unknown> };
patched.prototype.extra = () => 1;
Object.assign(math, { extra: () => 2 });

export function dynamic(): void {
  const store = new Proxy(UserStore.open('x'), {});
  (store as unknown as { anything(): void }).anything();
  UserStore.extra();
  math.extra();
}
