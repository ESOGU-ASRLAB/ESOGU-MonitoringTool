"""Blender background script for the hall's projected secondary UV atlas."""
from pathlib import Path
from math import pi
import bpy

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "client/public/assets"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ASSETS / "factory/warehouse_blender.blend.glb"))
shell = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
for obj in shell:
    if obj.parent is None:
        obj.scale /= 2.02157
for obj in bpy.context.scene.objects:
    if obj.type == "EMPTY" and obj.parent is None:
        obj.scale /= 2.02157

scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 12
scene.cycles.max_bounces = 3
scene.world = bpy.data.worlds.new("Overcast sky")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs[0].default_value = (0.75, 0.83, 1, 1)
scene.world.node_tree.nodes["Background"].inputs[1].default_value = 0.35

def point(x, y, z):
    return (x, -z, y)

for x in (-9, 0, 9):
    for z in (-13, 0, 13):
        data = bpy.data.lights.new("Overhead fixture", "AREA")
        data.energy = 850
        data.shape = "RECTANGLE"
        data.size = 3
        data.size_y = 9
        light = bpy.data.objects.new(data.name, data)
        scene.collection.objects.link(light)
        light.location = point(x, 6.9, z)
        data.color = (1.0, 0.89, 0.76)

for side in (-1, 1):
    for z in (-16, -5.5, 5.5, 16):
        data = bpy.data.lights.new("Clerestory bounce", "AREA")
        data.energy = 550
        data.color = (0.76, 0.87, 1.0)
        data.shape = "RECTANGLE"
        data.size, data.size_y = 1.05, 6
        light = bpy.data.objects.new(data.name, data)
        scene.collection.objects.link(light)
        light.location = point(side * 15.55, 5.85, z)
        light.rotation_euler[1] = side * pi / 2

# Rasterize the same world-space projections used by the WebGL materials.
# The receivers sit just inside the original shell and the shelves occlude
# the floor and wall light. Dynamic machinery is excluded from the bake.
regions = [
    ([(-16.27,.026,24.58),(16.27,.026,24.58),(16.27,.026,-24.58),(-16.27,.026,-24.58)], (0, 0, 2, 2)),
    ([(-15.94,0,-24.05),(15.94,0,-24.05),(15.94,9.8,-24.05),(-15.94,9.8,-24.05)], (2, 0, 3, 1)),
    ([(15.8,0,24.58),(15.8,0,-24.58),(15.8,9.8,-24.58),(15.8,9.8,24.58)], (2, 1, 3, 2)),
    ([(-15.8,0,-24.58),(-15.8,0,24.58),(-15.8,9.8,24.58),(-15.8,9.8,-24.58)], (0, 2, 1, 2.49)),
    ([(15.25,0,24.58),(15.25,0,-24.58),(15.25,5.4,-24.58),(15.25,5.4,24.58)], (0, 2.51, 1, 3)),
    ([(-16.27,6.8,-24.58),(16.27,6.8,-24.58),(16.27,6.8,24.58),(-16.27,6.8,24.58)], (1, 2, 3, 3)),
]
vertices, faces = [], []
for square, _ in regions:
    faces.append(tuple(range(len(vertices), len(vertices) + 4)))
    vertices.extend(point(*xyz) for xyz in square)
mesh = bpy.data.meshes.new("Hall lightmap receivers")
mesh.from_pydata(vertices, [], faces)
receivers = bpy.data.objects.new(mesh.name, mesh)
scene.collection.objects.link(receivers)
receivers.visible_shadow = False
receivers.visible_diffuse = False
uv = mesh.uv_layers.new(name="UV1")
for poly, (_, (left, bottom, right, top)) in zip(mesh.polygons, regions):
    for index, (u, v) in zip(poly.loop_indices, [(left,bottom), (right,bottom), (right,top), (left,top)]):
        uv.data[index].uv = (u / 3 * (1 - 2 * .005) + .005, v / 3 * (1 - 2 * .005) + .005)

material = bpy.data.materials.new("Bake receiver")
material.use_nodes = True
mesh.materials.append(material)
target = material.node_tree.nodes.new("ShaderNodeTexImage")
material.node_tree.nodes.active = target
bpy.ops.object.select_all(action="DESELECT")
receivers.select_set(True)
bpy.context.view_layer.objects.active = receivers

def bake(name, kind, **options):
    image = bpy.data.images.new(name, 2048, 2048, alpha=False, float_buffer=True)
    target.image = image
    bpy.ops.object.bake(type=kind, margin=7, **options)
    return image

ao = bake("Static occlusion", "AO")
indirect = bake("Diffuse indirect", "DIFFUSE", pass_filter={"INDIRECT"})
import numpy as np
ao_pixels = np.empty(2048 * 2048 * 4, dtype=np.float32)
light_pixels = np.empty_like(ao_pixels)
ao.pixels.foreach_get(ao_pixels)
indirect.pixels.foreach_get(light_pixels)
ao_pixels = ao_pixels.reshape(-1, 4)
light_pixels = light_pixels.reshape(-1, 4)
# Keep broad indirect gradients and reserve dynamic contact for N8AO.
light_pixels[:, :3] = np.clip((0.31 + 0.69 * ao_pixels[:, :3]) *
                              (0.47 + 1.45 * light_pixels[:, :3]), 0.14, 1)
light_pixels[:, 3] = 1
output = bpy.data.images.new("Hall light atlas", 2048, 2048, alpha=False)
output.colorspace_settings.name = "Non-Color"
output.pixels.foreach_set(light_pixels.ravel())
output.filepath_raw = str(ASSETS / "realism/hall-lightmap.webp")
output.file_format = "WEBP"
output.save()
