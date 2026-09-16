"""Run with Blender --background --factory-startup --python design/cover-sticker.py.
Creates a new Strip Sticker scene without touching the open Blender session.
Renders both paper faces for the live, dynamically updated covers. The web
version bends a continuous flexible mesh, using these same paper faces.
The saved scene is the material source; the peel physics live in sticker-flight.ts.
"""
import bpy
import math
import random
from pathlib import Path

project = Path(__file__).resolve().parents[1]
scene = bpy.data.scenes.new("Strip Sticker")
bpy.context.window.scene = scene
scene.render.engine = "CYCLES"
scene.cycles.samples = 32
scene.cycles.use_denoising = True
scene.render.resolution_x = 512
scene.render.resolution_y = 512
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = "WEBP"
scene.render.image_settings.color_mode = "RGBA"
scene.render.image_settings.color_depth = "8"
scene.render.image_settings.quality = 94
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "None"
scene.render.fps = 60
scene.frame_end = 1
world = bpy.data.worlds.new("Sticker soft ambient")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (1, 1, 1, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 0.6
scene.world = world

def material(name, color, roughness):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Specular IOR Level"].default_value = 0.12
    return mat

def stock(name, light, dark):
    mat = material(name, light, 0.96)
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    shader = nodes.get("Principled BSDF")
    grain = nodes.new("ShaderNodeTexNoise")
    grain.inputs["Scale"].default_value = 190
    grain.inputs["Detail"].default_value = 3
    tone = nodes.new("ShaderNodeValToRGB")
    tone.color_ramp.elements[0].color = (*dark, 1)
    tone.color_ramp.elements[1].color = (*light, 1)
    links.new(grain.outputs["Fac"], tone.inputs[0])
    links.new(tone.outputs[0], shader.inputs["Base Color"])
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.25
    bump.inputs["Distance"].default_value = 0.016
    links.new(grain.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs[0], shader.inputs["Normal"])
    return mat

paper = stock("Uncoated ivory paper fibers", (0.94, 0.93, 0.89), (0.67, 0.65, 0.59))
rear = stock("Worn adhesive paper reverse", (0.78, 0.75, 0.67), (0.48, 0.44, 0.36))
ink = material("Cover placeholder - replace with any poster", (0.025, 0.07, 0.93), 0.86)

def sheet(name, width, height, radius, thickness, z, mat):
    ring = []
    for cx, cy, start in [(width/2-radius, height/2-radius, 0),
                          (-width/2+radius, height/2-radius, 90),
                          (-width/2+radius, -height/2+radius, 180),
                          (width/2-radius, -height/2+radius, 270)]:
        for step in range(9):
            angle = math.radians(start + step*90/8)
            ring.append((cx + radius*math.cos(angle), cy + radius*math.sin(angle)))
    n = len(ring)
    verts = [(x,y,z+dz) for dz in [-thickness/2,thickness/2] for x,y in ring]
    faces = [tuple(reversed(range(n))),tuple(range(n,2*n))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts,[],faces)
    mesh.update()
    obj = bpy.data.objects.new(name,mesh)
    scene.collection.objects.link(obj)
    obj.data.materials.append(mat)
    bevel = obj.modifiers.new("Paper edge, not inflated plastic", "BEVEL")
    bevel.width = 0.0015
    bevel.segments = 2
    return obj

backing = sheet("White paper backing", 2, 2, 0.048, 0.012, 0, paper)
cover = sheet("Live cover face", 1.91, 1.91, 0.018, 0.001, 0.008, ink)
backing.data.materials.append(rear)
backing.data.polygons[0].material_index = 1
rig = bpy.data.objects.new("Sticker paper material source", None)
scene.collection.objects.link(rig)
for obj in [backing, cover]:
    obj.parent = rig

# Fine discontinuous scratches, rubbed corners and stray paper fibers. These
# are actual Blender curves on the back, not a glossy or metallic overlay.
rng = random.Random(7391)
scuff_materials = [material("Rubbed wear", (0.40,0.37,0.30),1),
                   material("Soft dirt", (0.53,0.50,0.43),1),
                   material("Raised fibers", (0.90,0.87,0.79),1)]
for index in range(185):
    curve = bpy.data.curves.new("Paper scuff %03d" % index, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = rng.uniform(0.0005,0.0015)
    curve.bevel_resolution = 0
    spline = curve.splines.new("POLY")
    spline.points.add(3)
    x,y = rng.uniform(-0.94,0.94),rng.uniform(-0.94,0.94)
    # Concentrate the heavier handling marks near the rim.
    if index < 100:
        if index % 2: x = rng.choice([-1,1])*rng.uniform(0.7,0.95)
        else: y = rng.choice([-1,1])*rng.uniform(0.7,0.95)
    angle,length = rng.uniform(0,math.tau),rng.uniform(0.01,0.12)
    for step, point in enumerate(spline.points):
        point.co = (max(-.97,min(.97,x+math.cos(angle)*length*step/3)),
                    max(-.97,min(.97,y+math.sin(angle)*length*step/3+rng.uniform(-.004,.004))),
                    -.009,1)
    scratch = bpy.data.objects.new(curve.name,curve)
    scene.collection.objects.link(scratch)
    scratch.data.materials.append(scuff_materials[index%3])
    scratch.parent = rig

camera_data = bpy.data.cameras.new("Sticker orthographic camera")
camera = bpy.data.objects.new("Sticker orthographic camera",camera_data)
scene.collection.objects.link(camera)
camera.location = (0,0,5)
camera.data.type = "ORTHO"
camera.data.ortho_scale = 1.99
scene.camera = camera
light_data = bpy.data.lights.new("Large soft window", "AREA")
light = bpy.data.objects.new("Large soft window",light_data)
scene.collection.objects.link(light)
light.location = (-1.4,1.8,4)
light.rotation_euler = (0,0,0)
light.data.energy = 140
light.data.size = 5

cover.hide_render = True
scene.render.filepath = str(project / "public" / "cover-sticker-paper.webp")
bpy.ops.render.render(write_still=True)
rig.rotation_euler.y = math.pi
scene.render.filepath = str(project / "public" / "cover-sticker-back.webp")
bpy.ops.render.render(write_still=True)
cover.hide_render = False
rig.rotation_euler = (0,0,0)
camera.data.ortho_scale = 2.8
scene.frame_set(1)
# Repeated exports should not create .blend1 files in the source tree.
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(project / "design" / "cover-sticker.blend"))
print("STRIP_STICKER_READY")
