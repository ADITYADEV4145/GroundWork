"""Hidden checks for tasks on pinned more-itertools commits. Each follows the tests of the upstream fix."""
import os
import sys
import unittest
from itertools import count

import more_itertools as mi

task = os.environ["TASK_ID"]


class NumericRangeBig(unittest.TestCase):
    def test_eq(self):
        stop = 10**30
        cases = [
            ((0, stop, 1), (0, stop, 1), True),
            ((0, stop, 2), (0, stop - 1, 2), True),
            ((stop, 0, -2), (stop, 1, -2), True),
            ((0, stop, 1), (0, stop + 1, 1), False),
            ((0, stop, 1), (1, stop + 1, 1), False),
            ((0, stop, 1), (0, stop * 2, 2), False),
        ]
        for args1, args2, expected in cases:
            with self.subTest(args1=args1, args2=args2):
                self.assertEqual(range(*args1) == range(*args2), expected)
                self.assertEqual(mi.numeric_range(*args1) == mi.numeric_range(*args2), expected)

    def test_hash(self):
        stop = 10**30
        for args in [(0, stop, 1), (0, stop, 2), (stop, 0, -2)]:
            with self.subTest(args=args):
                r = mi.numeric_range(*args)
                self.assertEqual(hash(r), hash(range(*args)))
                self.assertEqual({r: "value"}[mi.numeric_range(*args)], "value")
                self.assertRaises(OverflowError, len, r)


class ChunkedEvenSize(unittest.TestCase):
    def test_zero(self):
        source = iter("ABC")
        self.assertEqual(list(mi.chunked_even(source, 0)), [])
        self.assertEqual(list(source), list("ABC"))

    def test_negative(self):
        source = iter("ABC")
        with self.assertRaises(ValueError):
            list(mi.chunked_even(source, -1))
        self.assertEqual(list(source), list("ABC"))

    def test_positive(self):
        self.assertEqual(list(mi.chunked_even("ABCDEFG", 3)), [["A", "B", "C"], ["D", "E"], ["F", "G"]])


class PeekableReverseSlice(unittest.TestCase):
    def test_finite(self):
        it = iter(range(100))
        p = mi.peekable(it)
        self.assertEqual(p[5::-1], [5, 4, 3, 2, 1, 0])
        self.assertEqual(next(it), 6)

    def test_infinite(self):
        def endless():
            # Fails fast instead of filling memory when the whole iterator is cached.
            for n in count():
                if n > 10_000:
                    raise AssertionError("peekable consumed an endless iterator")
                yield n

        p = mi.peekable(endless())
        self.assertEqual(p[4::-2], [4, 2, 0])
        self.assertEqual(next(p), 0)

    def test_other_slices(self):
        self.assertEqual(mi.peekable(range(10))[::-1], list(range(10))[::-1])
        self.assertEqual(mi.peekable(range(10))[-3:], [7, 8, 9])
        self.assertEqual(mi.peekable(range(10))[8:2:-2], [8, 6, 4])
        self.assertEqual(mi.peekable(range(10))[2:8:3], [2, 5])


class BucketFalseyValidator(unittest.TestCase):
    def test_honoured(self):
        class AllowedKeys(set):
            def __call__(self, key):
                return key in self

        allowed = AllowedKeys()
        self.assertFalse(allowed)
        d = mi.bucket(iter([10, 20, 11, 21]), key=lambda x: x, validator=allowed)
        self.assertEqual(list(d[10]), [])
        self.assertNotIn(10, d)
        self.assertEqual(set(d), set())

    def test_default(self):
        d = mi.bucket([10, 20, 11], key=lambda x: x // 10)
        self.assertEqual(list(d[1]), [10, 11])


class FalsyError(Exception):
    def __bool__(self):
        return False


class NoRepr:
    def __repr__(self):
        raise RuntimeError("repr should not be called")


class OneFalsyException(unittest.TestCase):
    def test_one(self):
        self.assertRaises(FalsyError, lambda: mi.one(count(), too_long=FalsyError("too many")))
        self.assertRaises(FalsyError, lambda: mi.one([], too_short=FalsyError("too few")))
        self.assertRaises(OverflowError, lambda: mi.one((NoRepr() for _ in count()), too_long=OverflowError))
        self.assertRaises(ValueError, lambda: mi.one([1, 2]))
        self.assertRaises(ValueError, lambda: mi.one([]))
        self.assertEqual(mi.one([1]), 1)

    def test_only(self):
        self.assertRaises(FalsyError, lambda: mi.only([1, 2], too_long=FalsyError("too many")))
        self.assertRaises(OverflowError, lambda: mi.only([NoRepr(), NoRepr(), NoRepr()], too_long=OverflowError))
        self.assertRaises(ValueError, lambda: mi.only([1, 2]))
        self.assertEqual(mi.only([], default=3), 3)


class SeekableMaxlenZero(unittest.TestCase):
    def test_peek(self):
        s = mi.seekable([10, 20, 30], maxlen=0)
        self.assertEqual(s.peek(), 10)
        self.assertEqual(s.peek(), 10)
        self.assertEqual(list(s), [10, 20, 30])

    def test_bool(self):
        s = mi.seekable([10, 20, 30], maxlen=0)
        self.assertTrue(s)
        self.assertEqual(list(s), [10, 20, 30])
        self.assertFalse(mi.seekable([], maxlen=0))


CASES = {
    "itertools-numeric-range-big": NumericRangeBig,
    "itertools-chunked-even-size": ChunkedEvenSize,
    "itertools-peekable-reverse-slice": PeekableReverseSlice,
    "itertools-bucket-falsey-validator": BucketFalseyValidator,
    "itertools-one-falsy-exception": OneFalsyException,
    "itertools-seekable-maxlen-zero": SeekableMaxlenZero,
}
suite = unittest.defaultTestLoader.loadTestsFromTestCase(CASES[task])
sys.exit(0 if unittest.TextTestRunner(verbosity=0).run(suite).wasSuccessful() else 1)
