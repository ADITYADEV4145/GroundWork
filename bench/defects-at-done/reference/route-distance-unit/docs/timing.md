# Timing

Arrival estimates come from `eta_minutes(speed_kph, distance_km)`:

```python
from routeplan.timing import eta_minutes
eta_minutes(40, 10)  # 15
```

Durations are rounded up to five minutes with `round_up_to_five`. Distances are rendered with `format_distance(km, unit)`.
