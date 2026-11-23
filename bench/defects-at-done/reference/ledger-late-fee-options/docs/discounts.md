# Discounts and late fees

A percentage discount is applied with `applyDiscount(percent, amountCents)`:

```ts
import { applyDiscount } from '../src/billing/discount.ts';
applyDiscount(10, 1050); // 945
```

Overdue invoices are charged `lateFee(amountCents, { daysLate, graceDays })`, 0.05% of the amount per day:

```ts
import { lateFee } from '../src/billing/late.ts';
lateFee(100000, { daysLate: 30 }); // 1500
```

Dates on notices are rendered with `formatDate(iso)`. Rates are rendered with `formatPercent(fraction)`.
