# ABOUTME: Tests for serve.py, the local development server for the viewer.
# ABOUTME: Run with: python3 -m unittest discover -s tests

import concurrent.futures
import contextlib
import io
import os
import subprocess
import sys
import tempfile
import threading
import unittest
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import serve  # noqa: E402


def read(path):
    with open(os.path.join(ROOT, path), "rb") as f:
        return f.read()


class TestServe(unittest.TestCase):
    def start(self):
        """Start a server on a free port, logging into a buffer; return its base URL and the log."""
        log = io.StringIO()
        redirect = contextlib.redirect_stderr(log)
        redirect.__enter__()
        self.addCleanup(redirect.__exit__, None, None, None)
        server = serve.make_server(0)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        return f"http://127.0.0.1:{server.server_address[1]}", log

    def test_serves_the_checkout_from_any_directory(self):
        cwd = os.getcwd()
        os.chdir(tempfile.gettempdir())
        self.addCleanup(os.chdir, cwd)
        base, _ = self.start()
        with urllib.request.urlopen(f"{base}/index.html") as response:
            self.assertEqual(response.read(), read("index.html"))

    def test_answers_a_burst_of_simultaneous_requests(self):
        # The viewer requests all of its modules at once.
        base, _ = self.start()
        modules = sorted(f for f in os.listdir(os.path.join(ROOT, "assets")) if f.endswith(".js"))
        paths = [f"/assets/{name}" for name in modules] * 8
        barrier = threading.Barrier(len(paths))

        def get(path):
            barrier.wait()
            with urllib.request.urlopen(f"{base}{path}") as response:
                return response.status

        with concurrent.futures.ThreadPoolExecutor(max_workers=len(paths)) as pool:
            statuses = list(pool.map(get, paths))
        self.assertEqual(statuses, [200] * len(paths))

    def test_logs_each_request(self):
        base, log = self.start()
        with urllib.request.urlopen(f"{base}/index.html"):
            pass
        self.assertIn('"GET /index.html HTTP/1.1" 200', log.getvalue())

    def test_command_line_prints_its_url(self):
        process = subprocess.Popen([sys.executable, os.path.join(ROOT, "serve.py"), "0"],
                                   stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
        self.addCleanup(process.wait)
        self.addCleanup(process.terminate)
        line = process.stdout.readline()
        process.stdout.close()
        self.assertTrue(line.startswith(f"Serving {ROOT} at http://127.0.0.1:"), line)
        url = line.split(" at ", 1)[1].strip()
        with urllib.request.urlopen(f"{url}index.html") as response:
            self.assertEqual(response.read(), read("index.html"))


if __name__ == "__main__":
    unittest.main()
