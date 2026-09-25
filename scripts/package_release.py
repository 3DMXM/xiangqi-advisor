"""Build the extension and complete Windows release archives."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo


ROOT = Path(__file__).resolve().parents[1]
EXTENSION_FILES = (
    "extension/manifest.json",
    "extension/main.js",
    "extension/bridge.js",
    "extension/service-worker.js",
)
WINDOWS_FILES = (
    *EXTENSION_FILES,
    "README.md",
    "象棋分析助手-使用说明.md",
    "start-xiangqi-advisor.cmd",
    "xiangqi_advisor_server.py",
    "pikafish_bridge.py",
    "third_party/pikafish/Pikafish-Windows-x86-64-universal.exe",
    "third_party/pikafish/pikafish.nnue",
    "third_party/pikafish/README.md",
    "third_party/pikafish/Copying.txt",
    "third_party/pikafish/NNUE-License.md",
)


def add_file(archive: ZipFile, source: str, name: str) -> None:
    info = ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
    info.compress_type = ZIP_DEFLATED
    info.external_attr = 0o644 << 16
    with (ROOT / source).open("rb") as input_file, archive.open(info, "w") as output_file:
        shutil.copyfileobj(input_file, output_file)


def build_zip(destination: Path, files: tuple[str, ...], prefix: str = "") -> None:
    with ZipFile(destination, "w", compression=ZIP_DEFLATED, compresslevel=9) as archive:
        for source in files:
            name = source.removeprefix("extension/") if not prefix and source.startswith("extension/") else source
            add_file(archive, source, prefix + name)
    with ZipFile(destination) as archive:
        if archive.testzip() is not None:
            raise RuntimeError(f"Archive failed verification: {destination}")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as input_file:
        for chunk in iter(lambda: input_file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tag", required=True, help="Release tag, for example v2.0.0")
    parser.add_argument("--output-dir", type=Path, default=ROOT / "dist")
    args = parser.parse_args()

    match = re.fullmatch(r"v([0-9]+\.[0-9]+\.[0-9]+)", args.tag)
    if not match:
        parser.error("Tag must have the form vX.Y.Z")
    manifest = json.loads((ROOT / "extension/manifest.json").read_text(encoding="utf-8"))
    if manifest.get("version") != match.group(1):
        parser.error(f"Tag {args.tag} does not match manifest version {manifest.get('version')}")
    missing = [name for name in WINDOWS_FILES if not (ROOT / name).is_file()]
    if missing:
        parser.error("Missing release files: " + ", ".join(missing))

    output = args.output_dir.resolve()
    output.mkdir(parents=True, exist_ok=True)
    extension_zip = output / f"xiangqi-advisor-extension-{args.tag}.zip"
    windows_zip = output / f"xiangqi-advisor-windows-{args.tag}.zip"
    build_zip(extension_zip, EXTENSION_FILES)
    build_zip(windows_zip, WINDOWS_FILES, prefix=f"xiangqi-advisor-{args.tag}/")
    checksums = output / "SHA256SUMS"
    checksums.write_text(
        "".join(f"{sha256(path)}  {path.name}\n" for path in (extension_zip, windows_zip)),
        encoding="utf-8",
    )
    for path in (extension_zip, windows_zip, checksums):
        print(f"{path.name}: {path.stat().st_size} bytes")


if __name__ == "__main__":
    main()
