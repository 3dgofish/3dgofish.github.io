#!/usr/bin/env python3
"""Loopback-only static server with byte-range support for local MP4 preview."""

import argparse
import functools
import os
import re
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import BinaryIO, Optional, Tuple


class RangeRequestHandler(SimpleHTTPRequestHandler):
    """Serve one HTTP byte range so browsers can seek and decode MP4 files."""

    _range: Optional[Tuple[int, int]] = None

    def send_head(self) -> Optional[BinaryIO]:
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            return super().send_head()

        content_type = self.guess_type(path)
        try:
            source = open(path, "rb")
        except OSError:
            self.send_error(HTTPStatus.NOT_FOUND, "File not found")
            return None

        stat = os.fstat(source.fileno())
        size = stat.st_size
        requested_range = self.headers.get("Range")
        self._range = None

        if requested_range:
            parsed = self._parse_range(requested_range, size)
            if parsed is None:
                source.close()
                self.send_response(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                self.send_header("Content-Range", f"bytes */{size}")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return None

            start, end = parsed
            self._range = (start, end)
            self.send_response(HTTPStatus.PARTIAL_CONTENT)
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
            content_length = end - start + 1
        else:
            self.send_response(HTTPStatus.OK)
            content_length = size

        self.send_header("Content-Type", content_type)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(content_length))
        self.send_header("Last-Modified", self.date_time_string(stat.st_mtime))
        self.end_headers()
        return source

    @staticmethod
    def _parse_range(value: str, size: int) -> Optional[Tuple[int, int]]:
        match = re.fullmatch(r"bytes=(\d*)-(\d*)", value.strip())
        if not match or size <= 0:
            return None

        start_text, end_text = match.groups()
        if not start_text and not end_text:
            return None

        if start_text:
            start = int(start_text)
            end = int(end_text) if end_text else size - 1
        else:
            suffix_length = int(end_text)
            if suffix_length <= 0:
                return None
            start = max(0, size - suffix_length)
            end = size - 1

        if start >= size or start > end:
            return None
        return start, min(end, size - 1)

    def copyfile(self, source: BinaryIO, outputfile: BinaryIO) -> None:
        if self._range is None:
            super().copyfile(source, outputfile)
            return

        start, end = self._range
        source.seek(start)
        remaining = end - start + 1
        while remaining:
            chunk = source.read(min(64 * 1024, remaining))
            if not chunk:
                break
            try:
                outputfile.write(chunk)
            except (BrokenPipeError, ConnectionResetError):
                # Browsers cancel speculative/range requests once they have the
                # metadata or frame they need. That is normal media behavior.
                break
            remaining -= len(chunk)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--directory", type=Path, default=Path.cwd())
    args = parser.parse_args()

    root = args.directory.resolve()
    handler = functools.partial(RangeRequestHandler, directory=str(root))
    server = ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    print(f"Serving {root} at http://127.0.0.1:{args.port} (Ctrl-C to stop)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
