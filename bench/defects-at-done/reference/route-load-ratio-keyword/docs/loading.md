# Loading

`load_ratio(weight_kg, capacity_kg=...)` is the share of a vehicle's capacity in use:

```python
from routeplan.capacity_ratio import load_ratio
load_ratio(600, capacity_kg=800)  # 0.75
```

Weights on labels are rendered with `format_weight(kg)`. Durations on notices are rendered with `format_duration(minutes)`.
