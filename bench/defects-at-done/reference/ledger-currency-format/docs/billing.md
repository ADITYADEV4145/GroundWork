# Billing

Tax is computed per region with `taxFor(region, amountCents)`:

```ts
import { taxFor } from '../src/billing/rates.ts';
taxFor('EU', 1000); // 200
```

All money values are whole cents and are rounded with `roundHalfEven` (ties to the even cent).
Amounts are rendered with `formatCents(cents, currency)`.
