"""Write the invented placeholder crop used by tests and the seed command.

    uv run python scripts/make_placeholder_crop.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent.parent / "tests" / "data" / "crop.jpg"


def main() -> None:
    image = Image.new("RGB", (640, 360), (110, 110, 110))
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default(size=40)
    draw.text((320, 180), "Invented crop", fill=(235, 235, 235), font=font, anchor="mm")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    image.save(OUT, "JPEG", quality=80)
    print(f"Wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
