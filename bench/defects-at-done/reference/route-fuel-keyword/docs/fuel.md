# Fuel

Fuel use comes from `fuel_litres(distance_km, rate_l_per_100km=8.5)`:

```python
from routeplan.fuel import fuel_litres
fuel_litres(120)  # 10.2
```

`trip_cost` and `leg_costs` in `routeplan/costs.py` multiply it by the price per litre.
