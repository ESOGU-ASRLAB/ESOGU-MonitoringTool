# Realistic look (CC0 assets)

The desktop and XR factory views share these assets.

| File | Source | Licence |
|---|---|---|
| `machine_shop_02_1k.hdr` | [Machine Shop 02](https://polyhaven.com/a/machine_shop_02), Poly Haven | CC0 |
| `hall-concrete-albedo.webp` and `hall-concrete-surface.webp` | [Smooth Concrete Floor](https://polyhaven.com/a/smooth_concrete_floor), Dimitrios Savva via Poly Haven | CC0 |

The floor maps use the 1K JPG diffuse, displacement and roughness inputs.
The offline floor generator bakes the control joints and packs
height and roughness into one texture.

`hall-lightmap.webp` is the 2048 × 2048 static indirect-light and
ambient-occlusion atlas baked against the warehouse model. The runtime
projects its secondary UV coordinates onto the floor, shell and racks.
To regenerate the atlas from the repository root, run
`blender -b --python scripts/otokar/bake_hall_lightmap.py`.
