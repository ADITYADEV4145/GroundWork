# Fuel

Fuel use comes from `fuel_litres(rate_l_per_100km, distance_km)`:

```python
from routeplan.fuel import fuel_litres
fuel_litres(8.5, 120)  # 10.2
```

`trip_cost` and `leg_costs` in `routeplan/costs.py` multiply it by the price per litre.
