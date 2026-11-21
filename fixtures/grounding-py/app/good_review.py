import functools
import typing
from dataclasses import dataclass


@dataclass
class Cfg:
    name: str
    count: typing.ClassVar[int] = 0


Cfg("a")


def loose(fn):
    @functools.wraps(fn)
    def wrapper(self, *args, **kwargs):
        return fn(self)
    return wrapper


class Loose:
    @loose
    def __init__(self, a):
        self.a = a


Loose()


def greet(name):
    return name


greet = lambda: "hi"  # noqa: E731
greet()


class Patched:
    def __init__(self):
        pass

    def m(self, a):
        return a


Patched.m = lambda self: None
Patched().m()
