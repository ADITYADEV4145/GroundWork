export interface User {
  id: string;
  name: string;
  email?: string;
}

/** Look a user up by email address. */
export function getUserByEmail(email: string): User | null {
  return email ? { id: email, name: email } : null;
}

export function createUser(name: string, email?: string, ...tags: string[]): User {
  return { id: `${name}:${tags.join(',')}`, name, ...(email ? { email } : {}) };
}

export class UserStore {
  private cache?: Map<string, User>;

  constructor(private readonly dsn: string) {}

  static open(dsn: string): UserStore {
    return new UserStore(dsn);
  }

  find(id: string): User | undefined {
    return this.cache?.get(id);
  }

  save(user: User): void {
    this.cache ??= new Map();
    this.cache.set(user.id, user);
    this.log(`saved ${user.id} to ${this.dsn}`);
  }

  protected log(msg: string): void {
    void msg;
  }
}

export default function defaultStore(): UserStore {
  return UserStore.open('memory://');
}
