class StockLedger:
    def __init__(self, units: dict[str, int]):
        self.units = dict(units)

    def available(self, sku: str) -> int:
        return self.units.get(sku, 0)

    def hold(self, sku: str, quantity: int, *, allow_partial: bool = False) -> int:
        held = min(quantity, self.available(sku)) if allow_partial else quantity
        if held <= 0 or held > self.available(sku):
            return 0
        self.units[sku] = self.available(sku) - held
        return held

    def release(self, sku: str, quantity: int) -> None:
        self.units[sku] = self.available(sku) + quantity
