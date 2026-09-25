"""Minimal indexed-POSITION GLB writer (glTF 2.0).

Deliberately writes no NORMAL accessor: these are machined CAD parts, and
smooth per-vertex normals round off every hard edge. Omitting normals lets the
viewer shade them flat (three.js `flatShading`), which both looks right for
mechanical geometry and keeps the file roughly a third smaller.
"""
import json, struct


def write_glb(path, verts, idx, generator="ESOGU-MonitoringTool STEP->GLB"):
    """verts: flat list of float (x,y,z ...) in METRES. idx: flat list of int."""
    vbuf = struct.pack("<%df" % len(verts), *verts)
    nverts = len(verts) // 3
    if nverts > 65535:
        ibuf = struct.pack("<%dI" % len(idx), *idx)
        icomp = 5125  # UNSIGNED_INT
    else:
        ibuf = struct.pack("<%dH" % len(idx), *idx)
        icomp = 5123  # UNSIGNED_SHORT
    while len(ibuf) % 4:
        ibuf += b"\x00"

    mn = [min(verts[i::3]) for i in range(3)]
    mx = [max(verts[i::3]) for i in range(3)]

    gltf = {
        "asset": {"version": "2.0", "generator": generator},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0}],
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0}, "indices": 1}]}],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": nverts,
             "type": "VEC3", "min": mn, "max": mx},
            {"bufferView": 1, "componentType": icomp, "count": len(idx),
             "type": "SCALAR"},
        ],
        "bufferViews": [
            {"buffer": 0, "byteOffset": 0, "byteLength": len(vbuf), "target": 34962},
            {"buffer": 0, "byteOffset": len(vbuf), "byteLength": len(ibuf), "target": 34963},
        ],
        "buffers": [{"byteLength": len(vbuf) + len(ibuf)}],
    }

    jchunk = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    while len(jchunk) % 4:
        jchunk += b" "
    bchunk = vbuf + ibuf

    total = 12 + 8 + len(jchunk) + 8 + len(bchunk)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(jchunk), 0x4E4F534A)); f.write(jchunk)
        f.write(struct.pack("<II", len(bchunk), 0x004E4942)); f.write(bchunk)
    return total
