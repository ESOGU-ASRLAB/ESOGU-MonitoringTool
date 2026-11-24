"""Prepare the factory floor maps from Poly Haven's 1K Smooth Concrete Floor maps."""

import argparse
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps


SIZE = 1024
BAY_WIDTH = 32.54 / 6
BAY_LENGTH = 49.16 / 8


def tile(path):
    # The source scan covers 2 metres. Three repeats cover a concrete bay.
    tile_size = 342
    source = Image.open(path).convert("L").resize((tile_size, tile_size), Image.Resampling.LANCZOS)
    result = Image.new("L", (tile_size * 3, tile_size * 3))
    for y in range(3):
        for x in range(3):
            result.paste(source, (x * tile_size, y * tile_size))
    return result.resize((SIZE, SIZE), Image.Resampling.LANCZOS)


def joints(strength):
    image = Image.new("L", (SIZE, SIZE), 255)
    edge_x = round(SIZE * .014 / BAY_WIDTH)
    edge_y = round(SIZE * .014 / BAY_LENGTH)
    draw = ImageDraw.Draw(image)
    for x in (0, SIZE - edge_x):
        draw.rectangle((x, 0, x + edge_x - 1, SIZE - 1), fill=255 - strength)
    for y in (0, SIZE - edge_y):
        draw.rectangle((0, y, SIZE - 1, y + edge_y - 1), fill=255 - strength)
    return image.filter(ImageFilter.GaussianBlur(.9))


def remap(image, low, high):
    stretched = ImageOps.autocontrast(image, cutoff=1)
    return stretched.point(lambda value: round(low + value * (high - low) / 255))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("diffuse", type=Path)
    parser.add_argument("height", type=Path)
    parser.add_argument("roughness", type=Path)
    inputs = parser.parse_args()
    out = Path("client/public/assets/realism")
    diffuse = ImageChops.multiply(remap(tile(inputs.diffuse), 210, 255), joints(37))
    height = ImageChops.multiply(remap(tile(inputs.height), 96, 157), joints(75))
    roughness = remap(tile(inputs.roughness), 224, 252)
    finish = Image.merge("RGB", (height, roughness, Image.new("L", height.size)))
    diffuse.save(out / "hall-concrete-albedo.webp", quality=88, method=6)
    finish.save(out / "hall-concrete-surface.webp", lossless=True, method=6)


if __name__ == "__main__":
    main()
