"""Read a Helper export into a fresh staging directory before updating the site."""
import argparse
from pathlib import Path
import re
import subprocess
import tempfile
import zipfile


def import_zip(filename):
    folder = Path("imports").resolve()
    source = (folder / filename).resolve()
    if source.parent != folder or filename != source.name or source.suffix.lower() != ".zip":
        raise ValueError("Choose a ZIP filename from imports/")
    with tempfile.TemporaryDirectory() as temporary, zipfile.ZipFile(source) as archive:
        staging = Path(temporary)
        names = archive.namelist()
        if len(set(names)) != len(names) or "approved-results.json" not in names:
            raise ValueError("Expected exactly one approved-results.json")
        (staging / "races").mkdir()
        for entry in archive.infolist():
            if entry.filename == "approved-results.json":
                limit = 10_000_000
            elif re.fullmatch(r"races/race-[1-7]\.json", entry.filename):
                limit = 16 * 1024 * 1024
            else:
                raise ValueError(f"Unexpected ZIP entry: {entry.filename}")
            if entry.file_size > limit:
                raise ValueError(f"Oversize ZIP entry: {entry.filename}")
            (staging / entry.filename).write_bytes(archive.read(entry))
        subprocess.run(["node", "scripts/import_match.cjs", str(staging / "approved-results.json")], check=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("filename")
    import_zip(parser.parse_args().filename)
