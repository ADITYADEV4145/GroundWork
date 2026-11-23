# Discounts and late fees

A percentage discount is applied with `applyDiscount(amountCents, { percent, capCents })`:

```ts
import { applyDiscount } from '../src/billing/discount.ts';
applyDiscount(1050, { percent: 10 }); // 945
```

Overdue invoices are charged `lateFee(daysLate, amountCents)`, 0.05% of the amount per day:

```ts
import { lateFee } from '../src/billing/late.ts';
lateFee(30, 100000); // 1500
```

Dates on notices are rendered with `formatDate(iso)`. Rates are rendered with `formatPercent(fraction)`.
