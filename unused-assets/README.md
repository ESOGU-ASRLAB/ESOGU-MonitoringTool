# unused-assets

Files moved out of `client/public/` because the web app never requests them.
Everything under `client/public/` is copied into the build and served publicly,
so a file parked there costs deploy size and is one direct request away from
a large bandwidth hit, even if no page links to it.

Assets are listed by their file name or relative path.

| File | Size | Why it is here |
|---|---|---|
| `collision.glb` | 206 MB | Full-resolution bus solids (incl. quarantined ones), written by `export_bus_solids.py`. No script or component reads it. |
| `assets/factory/warehouse.glb` | 9 MB | Superseded by `warehouse_blender.blend.glb` (the one `Factory.js` loads). |
| `assets/factory/warehouse_blender.glb` | 9 MB | Same as above. |

`export_bus_solids.py` writes `collision.glb` straight into this
folder; its `hi/` and `lo/` body exports still go to `client/public/`.

These are Git LFS objects (`*.glb` in `.gitattributes`); moving them does not
change the LFS storage they use.
