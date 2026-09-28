# unused-assets

Files moved out of `client/public/` because the web app never requests them.
Everything under `client/public/` is copied into the build and served publicly,
so a file parked there costs deploy size and is one direct request away from
a large bandwidth hit, even if no page links to it.

Paths mirror `client/public/`, so moving a file back is a single `git mv`.

| File | Size | Why it is here |
|---|---|---|
| `meshes/otokar/bus/collision.glb` | 206 MB | Full-resolution bus solids (incl. quarantined ones), written by `scripts/otokar/export_bus_solids.py`. No script or component reads it. |
| `assets/factory/warehouse.glb` | 9 MB | Superseded by `warehouse_blender.blend.glb` (the one `Factory.js` loads). |
| `assets/factory/warehouse_blender.glb` | 9 MB | Same as above. |

Note: `scripts/otokar/export_bus_solids.py` still writes `collision.glb` into
`client/public/meshes/otokar/bus/`. After re-running it, move that output here
again (or change the script's output path) before committing.

These are Git LFS objects (`*.glb` in `.gitattributes`); moving them does not
change the LFS storage they use.
