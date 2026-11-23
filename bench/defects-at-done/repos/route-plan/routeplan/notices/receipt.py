from routeplan.duration import format_duration


def receipt_notice(minutes: int) -> str:
    return f"Delivered in {format_duration(minutes)}"
