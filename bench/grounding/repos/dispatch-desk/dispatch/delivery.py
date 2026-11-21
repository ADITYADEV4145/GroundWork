def quote_delivery(weight: float, *, region: str, express: bool = False) -> int | None:
    if region not in {'local', 'remote'} or weight <= 0:
        return None
    base = 200 if region == 'local' else 800
    return base + round(weight * 100) + (500 if express else 0)

def quote_return(weight: float) -> int:
    return 100 + round(weight * 25)
