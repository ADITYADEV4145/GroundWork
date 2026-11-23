# Stock

Prices are whole cents. A discount is applied with `Discounted(cents, opts)`:

```go
pricing.Discounted(1000, pricing.Options{Percent: 10}) // 900
```

The reorder point of an item is `ReorderPoint(leadDays, dailyUse)`:

```go
restock.ReorderPoint(5, 12) // 60
```

Fractions of a cent are rounded with `money.RoundHalfEven` (ties to the even cent).
Amounts are rendered with `FormatCents(cents)` and quantities with `FormatQty(n)`.
Dates that count working days use `timeutil.AddWorkdays`.
