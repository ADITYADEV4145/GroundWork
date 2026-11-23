# Timing

Arrival estimates come from `eta_minutes(distance_km, speed_kph=40)`:

```python
from routeplan.timing import eta_minutes
eta_minutes(10, speed_kph=40)  # 15
```

Durations are rounded up to five minutes with `round_up_to_five`. Distances are rendered with `format_distance(km)`.
