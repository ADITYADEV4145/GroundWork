import os

TAX_RATE_ENV = "TAX_RATE"


def rate(region, default=0.2):
    return float(os.environ.get("TAX_RATE", default))


async def fetch_rates(*regions, **opts):
    return [rate(r) for r in regions]
