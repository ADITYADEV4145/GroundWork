from routeplan.internal.textcase import snake_join
from routeplan.models import Stop


def stop_key(stop: Stop) -> str:
    name = snake_join(stop.name)
    return f"{name}_{stop.sequence}" if name else str(stop.sequence)
