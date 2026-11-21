def parse_port(value: str):
    """Parse an integer TCP port between one and 65535."""
    port = float(value)
    if port % 1 != 0 or not (1 <= port <= 65535):
        raise ValueError("Invalid port")
    return int(port)
