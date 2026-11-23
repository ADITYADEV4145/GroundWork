# Billing

Tax is computed per region with `taxFor(amountCents, { region, exempt? })`:

```ts
import { taxFor } from '../src/billing/rates.ts';
taxFor(1000, { region: 'EU' }); // 200
taxFor(1000, { region: 'EU', exempt: true }); // 0
```

All money values are whole cents and are rounded with `roundHalfEven` (ties to the even cent).
Amounts are rendered with `formatCents(cents)`.
