from routeplan.duration import format_duration


def sms_notice(minutes: int) -> str:
    return f"ETA {format_duration(minutes, "clock")}"
