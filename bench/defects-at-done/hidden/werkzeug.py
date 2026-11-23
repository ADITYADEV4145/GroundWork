"""Hidden checks for the long multi-step tasks on a pinned werkzeug commit. Each checks every step's function."""
import datetime as dt
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.environ.get("WORKSPACE_DIR", os.getcwd()), "src"))
task = os.environ["TASK_ID"]
UTC = dt.timezone.utc


class PreferHeader(unittest.TestCase):
    def test_parse(self):
        from werkzeug.prefer import parse_prefer

        self.assertEqual(parse_prefer(None), {})
        self.assertEqual(parse_prefer(""), {})
        self.assertEqual(
            parse_prefer('Respond-Async, WAIT=10, handling="lenient, mode", return=minimal'),
            {"respond-async": None, "wait": "10", "handling": "lenient, mode", "return": "minimal"},
        )
        self.assertEqual(parse_prefer('note="say \\"hi\\""'), {"note": 'say "hi"'})

    def test_dump(self):
        from werkzeug.prefer_applied import dump_preference_applied

        self.assertEqual(dump_preference_applied({}), "")
        self.assertEqual(
            dump_preference_applied({"wait": "10", "handling": "lenient mode", "respond-async": None}),
            'wait=10, handling="lenient mode", respond-async',
        )
        self.assertEqual(dump_preference_applied({"note": 'say "hi"'}), 'note="say \\"hi\\""')

    def test_negotiate(self):
        from werkzeug.prefer_negotiate import negotiate_preferences

        environ = {"HTTP_PREFER": 'Respond-Async, wait=10, handling="lenient mode", return=minimal'}
        self.assertEqual(
            negotiate_preferences(environ, {"wait", "handling", "respond-async"}),
            (
                {"respond-async": None, "wait": "10", "handling": "lenient mode"},
                'respond-async, wait=10, handling="lenient mode"',
            ),
        )
        self.assertEqual(negotiate_preferences({}, {"wait"}), ({}, ""))
        self.assertEqual(negotiate_preferences(environ, []), ({}, ""))


class Validators(unittest.TestCase):
    modified = dt.datetime(2026, 1, 2, 3, 4, 5, tzinfo=UTC)
    expires = dt.datetime(2026, 1, 2, 4, 4, 5, tzinfo=UTC)

    def test_make(self):
        from werkzeug.validators import make_validators
        from werkzeug.wrappers import Response

        response = Response(b"abc")
        response.add_etag()
        self.assertEqual(
            make_validators(b"abc", self.modified),
            {"ETag": response.headers["ETag"], "Last-Modified": "Fri, 02 Jan 2026 03:04:05 GMT"},
        )
        naive = make_validators(b"", dt.datetime(2026, 1, 2, 3, 4, 5))
        self.assertEqual(naive["Last-Modified"], "Fri, 02 Jan 2026 03:04:05 GMT")
        plus2 = dt.datetime(2026, 1, 2, 5, 4, 5, tzinfo=dt.timezone(dt.timedelta(hours=2)))
        self.assertEqual(make_validators(b"", plus2)["Last-Modified"], "Fri, 02 Jan 2026 03:04:05 GMT")

    def test_stale(self):
        from werkzeug.freshness import seconds_until_stale

        now = dt.datetime(2026, 1, 2, 4, 0, 0, tzinfo=UTC)
        self.assertEqual(seconds_until_stale({"Expires": "Fri, 02 Jan 2026 04:04:05 GMT"}, now), 245)
        self.assertEqual(seconds_until_stale({"Expires": "Fri, 02 Jan 2026 03:59:00 GMT"}, now), -60)
        self.assertEqual(seconds_until_stale({"Expires": "Fri, 02 Jan 2026 06:04:05 +0200"}, now), 245)
        self.assertIsNone(seconds_until_stale({}, now))
        self.assertIsNone(seconds_until_stale({"Expires": "soon"}, now))
        self.assertIsNone(seconds_until_stale({"Expires": "0"}, now))

    def test_revalidate(self):
        from werkzeug.revalidate import is_fresh, revalidation_headers
        from werkzeug.validators import make_validators

        headers = revalidation_headers(b"abc", self.modified, self.expires)
        self.assertEqual(headers, {**make_validators(b"abc", self.modified), "Expires": "Fri, 02 Jan 2026 04:04:05 GMT"})
        self.assertTrue(is_fresh(headers, dt.datetime(2026, 1, 2, 4, 0, 0, tzinfo=UTC)))
        self.assertFalse(is_fresh(headers, self.expires))
        self.assertFalse(is_fresh(headers, dt.datetime(2026, 1, 2, 5, 0, 0, tzinfo=UTC)))
        self.assertFalse(is_fresh({}, self.modified))
        self.assertFalse(is_fresh({"Expires": "never"}, self.modified))


class DownloadHeaders(unittest.TestCase):
    def test_name(self):
        from werkzeug.downloads import safe_download_name

        self.assertEqual(safe_download_name("../../etc/passwd"), "etc_passwd")
        self.assertEqual(safe_download_name("My cool movie.mov"), "My_cool_movie.mov")
        self.assertEqual(safe_download_name("i contain cool \xfcml\xe4uts.txt"), "i_contain_cool_umlauts.txt")
        self.assertEqual(safe_download_name(".."), "download")
        self.assertEqual(safe_download_name("///", "file"), "file")

    def test_disposition(self):
        from werkzeug.disposition import content_disposition

        self.assertEqual(content_disposition("a.txt"), "attachment; filename=a.txt")
        self.assertEqual(content_disposition("a.txt", True), "inline; filename=a.txt")
        self.assertEqual(content_disposition("my report.pdf"), 'attachment; filename="my report.pdf"')
        self.assertEqual(content_disposition('a"b.txt'), 'attachment; filename="a\\"b.txt"')

    def test_headers(self):
        from werkzeug.download_headers import download_headers

        self.assertEqual(
            download_headers("../../My Report (final).pdf", b"12345"),
            {
                "Content-Disposition": "attachment; filename=My_Report_final.pdf",
                "Content-Type": "application/pdf",
                "Content-Length": "5",
            },
        )
        self.assertEqual(
            download_headers("///", b"", True),
            {
                "Content-Disposition": "inline; filename=download",
                "Content-Type": "application/octet-stream",
                "Content-Length": "0",
            },
        )


CASES = {
    "werkzeug-prefer-then-negotiate": PreferHeader,
    "werkzeug-validators-then-revalidate": Validators,
    "werkzeug-download-name-then-headers": DownloadHeaders,
}
result = unittest.TextTestRunner(verbosity=0).run(unittest.defaultTestLoader.loadTestsFromTestCase(CASES[task]))
sys.exit(0 if result.wasSuccessful() else 1)
