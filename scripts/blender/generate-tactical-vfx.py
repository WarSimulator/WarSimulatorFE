"""Generate lightweight tactical VFX source frames and GLB props with Blender.

Run through `npm run generate:vfx`. Frame packing is handled by
`scripts/pack-vfx-sprites.py` so Blender only needs to render RGBA PNG files.
"""

from __future__ import annotations

import math
import random
import shutil
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def argument_value(name: str) -> Path:
    arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    try:
        return Path(arguments[arguments.index(name) + 1]).resolve()
    except (ValueError, IndexError) as error:
        raise SystemExit(f"Missing {name} argument") from error


OUTPUT = argument_value("--output")
FRAMES = argument_value("--frames")
FRAME_COUNT = 32


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for data in (bpy.data.materials, bpy.data.meshes, bpy.data.curves, bpy.data.cameras, bpy.data.lights):
        for item in list(data):
            if item.users == 0:
                data.remove(item)


def material(name: str, color: tuple[float, float, float, float], emission: float = 0.0, metallic: float = 0.0):
    value = bpy.data.materials.new(name)
    value.diffuse_color = color
    value.use_nodes = True
    principled = value.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = color
    principled.inputs["Roughness"].default_value = 0.78
    principled.inputs["Metallic"].default_value = metallic
    principled.inputs["Alpha"].default_value = color[3]
    if "Emission Color" in principled.inputs:
        principled.inputs["Emission Color"].default_value = color
        principled.inputs["Emission Strength"].default_value = emission
    return value


def point_camera(camera: bpy.types.Object, target: tuple[float, float, float]) -> None:
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat("-Z", "Y").to_euler()


def configure_render() -> None:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 256
    scene.render.resolution_y = 256
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = True
    scene.render.image_settings.color_depth = "8"
    scene.render.resolution_percentage = 100
    camera_data = bpy.data.cameras.new("VFX Camera")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = 7.2
    camera = bpy.data.objects.new("VFX Camera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = (7.8, -9.5, 6.1)
    point_camera(camera, (0.0, 0.0, 1.5))
    scene.camera = camera

    key = bpy.data.lights.new("Key", "AREA")
    key.energy = 850
    key.shape = "DISK"
    key.size = 5
    key_object = bpy.data.objects.new("Key", key)
    bpy.context.collection.objects.link(key_object)
    key_object.location = (3.5, -4.0, 7.0)
    point_camera(key_object, (0.0, 0.0, 1.2))


def add_ico(name: str, location: tuple[float, float, float], radius: float, value: bpy.types.Material):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=radius, location=location)
    item = bpy.context.object
    item.name = name
    item.data.materials.append(value)
    return item


def render_explosion() -> None:
    clear_scene()
    configure_render()
    rng = random.Random(7102)
    colors = [
        material("White Hot", (1.0, 0.78, 0.24, 1.0), 7.0),
        material("Fire", (1.0, 0.17, 0.015, 1.0), 4.0),
        material("Deep Fire", (0.35, 0.015, 0.005, 1.0), 2.0),
        material("Soot", (0.045, 0.035, 0.03, 1.0), 0.05),
    ]
    lobes = []
    for index in range(24):
        angle = rng.random() * math.tau
        radial = rng.random() ** 0.55
        base = Vector((math.cos(angle) * radial, math.sin(angle) * radial, rng.uniform(-0.15, 1.0)))
        item = add_ico(f"Fireball {index:02d}", tuple(base), rng.uniform(0.25, 0.62), colors[index % len(colors)])
        item.rotation_euler = (rng.random(), rng.random(), rng.random())
        lobes.append((item, base, rng.uniform(0.75, 1.3), rng.uniform(0.85, 1.25)))

    for frame in range(FRAME_COUNT):
        t = frame / (FRAME_COUNT - 1)
        expansion = math.sin(min(1.0, t * 1.45) * math.pi / 2)
        collapse = max(0.0, 1.0 - max(0.0, t - 0.62) / 0.38)
        for index, (item, base, speed, size) in enumerate(lobes):
            plume = Vector((base.x * (1.2 + expansion), base.y * (1.2 + expansion), base.z + t * (0.8 + index % 5 * 0.09)))
            item.location = plume * (0.35 + expansion * speed)
            scale = size * (0.12 + expansion * 1.1) * (0.35 + 0.65 * collapse)
            item.scale = (scale, scale, scale * (1.0 + t * 0.35))
            # Hot core early, smoke-dominant edge late.
            material_index = min(3, int(t * 3.6 + (index % 5 == 0)))
            item.data.materials.clear()
            item.data.materials.append(colors[material_index])
        path = FRAMES / "explosion" / f"frame-{frame:02d}.png"
        path.parent.mkdir(parents=True, exist_ok=True)
        bpy.context.scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)


def render_smoke() -> None:
    clear_scene()
    configure_render()
    rng = random.Random(9221)
    smoke_materials = [
        material("Smoke Light", (0.22, 0.235, 0.24, 0.92)),
        material("Smoke Mid", (0.10, 0.11, 0.115, 0.96)),
        material("Smoke Dark", (0.035, 0.04, 0.045, 0.98)),
    ]
    puffs = []
    for index in range(20):
        phase = index / 20
        angle = rng.random() * math.tau
        base = Vector((math.cos(angle) * rng.uniform(0.0, 0.6), math.sin(angle) * rng.uniform(0.0, 0.6), rng.uniform(0.0, 0.7)))
        item = add_ico(f"Smoke {index:02d}", tuple(base), rng.uniform(0.3, 0.72), smoke_materials[index % 3])
        item.rotation_euler = (rng.random(), rng.random(), rng.random())
        puffs.append((item, base, phase, rng.uniform(0.75, 1.35)))

    for frame in range(FRAME_COUNT):
        t = frame / FRAME_COUNT
        for index, (item, base, phase, size) in enumerate(puffs):
            age = (t + phase) % 1.0
            sway = math.sin((age + phase) * math.tau) * 0.28
            item.location = (
                base.x * (0.4 + age) + sway,
                base.y * (0.4 + age),
                0.2 + age * 3.0 + (index % 4) * 0.08,
            )
            scale = size * (0.25 + age * 1.15) * (0.55 + 0.45 * math.sin(age * math.pi))
            item.scale = (scale, scale, scale * 1.18)
            item.data.materials.clear()
            item.data.materials.append(smoke_materials[(index + int(age * 3)) % 3])
        path = FRAMES / "smoke" / f"frame-{frame:02d}.png"
        path.parent.mkdir(parents=True, exist_ok=True)
        bpy.context.scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)


def add_shard(index: int, rng: random.Random, value: bpy.types.Material):
    radius = rng.uniform(0.12, 0.4)
    depth = rng.uniform(0.25, 1.0)
    bpy.ops.mesh.primitive_cone_add(vertices=rng.choice((3, 4, 5)), radius1=radius, radius2=radius * rng.uniform(0.05, 0.45), depth=depth)
    shard = bpy.context.object
    shard.name = f"Debris {index:02d}"
    angle = rng.random() * math.tau
    distance = rng.uniform(0.3, 2.5)
    shard.location = (math.cos(angle) * distance, math.sin(angle) * distance, depth * 0.18)
    shard.rotation_euler = (rng.random() * math.pi, rng.random() * math.pi, rng.random() * math.tau)
    shard.data.materials.append(value)
    return shard


def export_models() -> None:
    models = OUTPUT / "models"
    models.mkdir(parents=True, exist_ok=True)
    clear_scene()
    rng = random.Random(4815)
    debris_materials = [
        material("Earth", (0.13, 0.095, 0.055, 1.0)),
        material("Char", (0.025, 0.028, 0.03, 1.0), metallic=0.15),
        material("Metal", (0.11, 0.12, 0.13, 1.0), metallic=0.7),
    ]
    for index in range(18):
        add_shard(index, rng, debris_materials[index % len(debris_materials)])
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(filepath=str(models / "debris-01.glb"), export_format="GLB", use_selection=True)

    clear_scene()
    earth = material("Crater Earth", (0.09, 0.06, 0.032, 1.0))
    char = material("Crater Char", (0.012, 0.014, 0.016, 1.0))
    bpy.ops.mesh.primitive_torus_add(major_radius=2.0, minor_radius=0.46, major_segments=32, minor_segments=8)
    rim = bpy.context.object
    rim.name = "Crater Rim"
    rim.scale.z = 0.28
    rim.data.materials.append(earth)
    bpy.ops.mesh.primitive_cylinder_add(vertices=40, radius=1.86, depth=0.035, location=(0.0, 0.0, -0.02))
    floor = bpy.context.object
    floor.name = "Crater Floor"
    floor.data.materials.append(char)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(filepath=str(models / "crater-01.glb"), export_format="GLB", use_selection=True)


if OUTPUT.exists():
    shutil.rmtree(OUTPUT)
OUTPUT.mkdir(parents=True, exist_ok=True)
if FRAMES.exists():
    shutil.rmtree(FRAMES)
FRAMES.mkdir(parents=True, exist_ok=True)

render_explosion()
render_smoke()
export_models()
print(f"Generated tactical VFX in {OUTPUT}")
