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


def textured_material(
    name: str,
    stops: list[tuple[float, tuple[float, float, float, float]]],
    emission: float = 0.0,
    noise_scale: float = 3.2,
):
    """Create a turbulent material that remains compatible with glTF-free sprite rendering."""
    value = bpy.data.materials.new(name)
    value.use_nodes = True
    nodes = value.node_tree.nodes
    links = value.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    noise = nodes.new("ShaderNodeTexNoise")
    ramp = nodes.new("ShaderNodeValToRGB")
    noise.inputs["Scale"].default_value = noise_scale
    noise.inputs["Detail"].default_value = 7.0
    noise.inputs["Roughness"].default_value = 0.78
    color_ramp = ramp.color_ramp
    color_ramp.elements.remove(color_ramp.elements[1])
    first_position, first_color = stops[0]
    color_ramp.elements[0].position = first_position
    color_ramp.elements[0].color = first_color
    for position, color in stops[1:]:
        element = color_ramp.elements.new(position)
        element.color = color
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    if emission > 0:
        # A pure emission surface keeps fire yellow/orange instead of allowing the
        # key light and Principled highlights to wash it into a pale pink blob.
        shader = nodes.new("ShaderNodeEmission")
        shader.inputs["Strength"].default_value = emission
        links.new(ramp.outputs["Color"], shader.inputs["Color"])
        links.new(shader.outputs["Emission"], output.inputs["Surface"])
    else:
        shader = nodes.new("ShaderNodeBsdfPrincipled")
        shader.inputs["Roughness"].default_value = 0.9
        links.new(ramp.outputs["Color"], shader.inputs["Base Color"])
        links.new(shader.outputs["BSDF"], output.inputs["Surface"])
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
    # Sprite colors need to survive exactly as authored. AgX is excellent for
    # photographed scenes but compresses the small orange fire range too much.
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "Medium High Contrast"
    scene.render.image_settings.color_depth = "8"
    scene.render.resolution_percentage = 100
    scene.render.image_settings.color_mode = "RGBA"
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


def add_ico(name: str, location: tuple[float, float, float], radius: float, value: bpy.types.Material, detail: int = 2, roughness: float = 0.0):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=detail, radius=radius, location=location)
    item = bpy.context.object
    item.name = name
    item.data.materials.append(value)
    for polygon in item.data.polygons:
        polygon.use_smooth = True
    if roughness:
        for vertex in item.data.vertices:
            direction = vertex.co.normalized()
            turbulence = (
                math.sin(vertex.co.x * 9.1 + vertex.co.y * 3.7)
                + math.sin(vertex.co.y * 7.3 + vertex.co.z * 5.9)
                + math.sin(vertex.co.z * 8.7 + vertex.co.x * 4.1)
            ) / 3
            vertex.co += direction * radius * roughness * turbulence
        item.data.update()
    return item


def render_explosion() -> None:
    clear_scene()
    configure_render()
    rng = random.Random(7102)
    white_hot = textured_material("White Hot", [
        (0.0, (1.0, 0.24, 0.003, 1.0)),
        (0.3, (1.0, 0.65, 0.025, 1.0)),
        (0.65, (1.0, 1.0, 0.42, 1.0)),
        (1.0, (1.0, 1.0, 0.92, 1.0)),
    ], 1.15, 4.8)
    yellow_fire = textured_material("Yellow Fire", [
        (0.0, (0.42, 0.018, 0.0, 1.0)),
        (0.3, (1.0, 0.18, 0.002, 1.0)),
        (0.63, (1.0, 0.62, 0.018, 1.0)),
        (1.0, (1.0, 0.98, 0.22, 1.0)),
    ], 0.92, 4.1)
    orange_fire = textured_material("Orange Fire", [
        (0.0, (0.045, 0.004, 0.0, 1.0)),
        (0.38, (0.38, 0.035, 0.0, 1.0)),
        (0.7, (1.0, 0.22, 0.002, 1.0)),
        (1.0, (1.0, 0.68, 0.025, 1.0)),
    ], 0.76, 3.7)
    smoke = textured_material("Blast Smoke", [
        (0.0, (0.018, 0.012, 0.009, 1.0)),
        (0.45, (0.09, 0.045, 0.022, 1.0)),
        (0.72, (0.26, 0.12, 0.052, 1.0)),
        (1.0, (0.55, 0.28, 0.10, 1.0)),
    ], 0.18, 4.8)
    soot = textured_material("Blast Soot", [
        (0.0, (0.012, 0.01, 0.009, 1.0)),
        (0.55, (0.055, 0.034, 0.022, 1.0)),
        (1.0, (0.2, 0.105, 0.048, 1.0)),
    ], 0.0, 5.5)
    spark_materials = [
        material("Spark White", (1.0, 0.9, 0.42, 1.0), 12.0),
        material("Spark Orange", (1.0, 0.12, 0.002, 1.0), 8.0),
    ]

    core_lobes = []
    for index in range(18):
        angle = rng.random() * math.tau
        radial = rng.random() ** 0.75 * 0.62
        base = Vector((math.cos(angle) * radial, math.sin(angle) * radial - 0.42, rng.uniform(0.0, 0.95)))
        item = add_ico(f"Core {index:02d}", tuple(base), rng.uniform(0.26, 0.6), white_hot if index < 6 else yellow_fire, 3, 0.2)
        item.rotation_euler = (rng.random(), rng.random(), rng.random())
        core_lobes.append((item, base, rng.uniform(0.65, 1.15), rng.uniform(0.8, 1.25)))

    outer_lobes = []
    for index in range(36):
        angle = rng.random() * math.tau
        radial = rng.uniform(0.45, 1.35)
        base = Vector((math.cos(angle) * radial, math.sin(angle) * radial * 0.75, rng.uniform(-0.2, 1.35)))
        initial_material = yellow_fire if index % 6 == 0 else orange_fire
        item = add_ico(f"Outer Fire {index:02d}", tuple(base), rng.uniform(0.18, 0.5), initial_material, 2, 0.34)
        item.rotation_euler = (rng.random(), rng.random(), rng.random())
        outer_lobes.append((item, base, rng.uniform(0.85, 1.5), rng.uniform(0.75, 1.35)))

    smoke_lobes = []
    for index in range(18):
        angle = rng.random() * math.tau
        radial = rng.uniform(0.55, 1.4)
        base = Vector((math.cos(angle) * radial, math.sin(angle) * radial * 0.7, rng.uniform(0.05, 1.55)))
        item = add_ico(f"Smoke Lobe {index:02d}", tuple(base), rng.uniform(0.28, 0.68), smoke if index % 4 else soot, 3, 0.28)
        item.rotation_euler = (rng.random(), rng.random(), rng.random())
        smoke_lobes.append((item, base, rng.uniform(0.8, 1.4), rng.uniform(0.75, 1.35)))

    ground_lobes = []
    for index in range(20):
        angle = index / 20 * math.tau + rng.uniform(-0.13, 0.13)
        base = Vector((math.cos(angle) * rng.uniform(1.0, 1.8), math.sin(angle) * rng.uniform(0.65, 1.2), rng.uniform(-0.35, 0.0)))
        item = add_ico(f"Ground Blast {index:02d}", tuple(base), rng.uniform(0.18, 0.48), orange_fire if index % 3 else smoke, 2, 0.25)
        ground_lobes.append((item, base, rng.uniform(1.15, 1.9), rng.uniform(0.65, 1.15)))

    sparks = []
    for index in range(90):
        angle = rng.random() * math.tau
        upward = rng.uniform(-0.2, 1.5)
        velocity = Vector((math.cos(angle) * rng.uniform(1.3, 3.9), math.sin(angle) * rng.uniform(0.8, 2.8), upward))
        origin = Vector((rng.uniform(-0.35, 0.35), rng.uniform(-0.25, 0.25), rng.uniform(0.05, 1.0)))
        bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=rng.uniform(0.014, 0.035), radius2=0.0, depth=rng.uniform(0.09, 0.28), location=origin)
        item = bpy.context.object
        item.name = f"Spark {index:02d}"
        item.data.materials.append(spark_materials[index % 2])
        item.rotation_mode = "QUATERNION"
        item.rotation_quaternion = velocity.normalized().to_track_quat("Z", "Y")
        sparks.append((item, origin, velocity, rng.uniform(0.5, 1.0)))

    for frame in range(FRAME_COUNT):
        t = frame / (FRAME_COUNT - 1)
        expansion = math.sin(min(1.0, t / 0.48) * math.pi / 2)
        fire_decay = max(0.18, 1.0 - max(0.0, t - 0.58) / 0.42)
        for index, (item, base, speed, size) in enumerate(core_lobes):
            item.location = base * (0.22 + expansion * speed) + Vector((0, 0, t * (0.35 + index % 4 * 0.07)))
            scale = size * (0.08 + expansion * 1.25) * fire_decay
            item.scale = (scale, scale * 0.92, scale * (1.08 + t * 0.52))
            next_material = white_hot if t < 0.4 and index < 6 else yellow_fire if t < 0.68 else orange_fire
            item.data.materials.clear(); item.data.materials.append(next_material)
        for index, (item, base, speed, size) in enumerate(outer_lobes):
            item.location = base * (0.18 + expansion * speed) + Vector((0, 0, t * (0.55 + index % 6 * 0.08)))
            scale = size * (0.08 + expansion * 1.18) * (0.62 + fire_decay * 0.38)
            flame_stretch = 1.15 + t * 0.8 + (index % 5) * 0.08
            item.scale = (scale * 0.9, scale, scale * flame_stretch)
            next_material = yellow_fire if t < 0.34 and index % 6 == 0 else orange_fire if t < 0.62 else smoke
            item.data.materials.clear(); item.data.materials.append(next_material)
        for index, (item, base, speed, size) in enumerate(smoke_lobes):
            visibility = min(1.0, max(0.0, (t - 0.18) / 0.3))
            item.location = base * (0.25 + expansion * speed) + Vector((0, 0, t * (0.9 + index % 5 * 0.13)))
            scale = size * visibility * (0.18 + expansion * 1.12)
            item.scale = (scale, scale, scale * (1.0 + t * 0.65))
            item.data.materials.clear(); item.data.materials.append(smoke if index % 4 else soot)
        for item, base, speed, size in ground_lobes:
            item.location = base * (0.14 + expansion * speed)
            scale = size * (0.05 + expansion * 1.15) * (0.8 + fire_decay * 0.2)
            item.scale = (scale * 1.3, scale, scale * 0.72)
        for item, origin, velocity, delay in sparks:
            age = max(0.0, t * 1.45 - (1.0 - delay) * 0.24)
            item.location = origin + velocity * age + Vector((0, 0, -2.2 * age * age))
            visible = 1.0 if 0.0 < age < 0.82 else 0.0
            item.scale = (visible, visible, visible * (1.0 + velocity.length * 0.18))
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
