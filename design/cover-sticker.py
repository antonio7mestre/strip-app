"""Run with Blender --background --factory-startup --python design/cover-sticker.py.
Creates a new Strip Sticker scene without touching the open Blender session.
The reusable paper backing is rendered for the live, dynamically updated covers.
The saved scene also contains the lift-and-settle motion reference at 60 fps.
"""
import bpy
import math
from pathlib import Path

project = Path(__file__).resolve().parents[1]
scene = bpy.data.scenes.new("Strip Sticker")
bpy.context.window.scene = scene
scene.render.engine = "CYCLES"
scene.cycles.samples = 24
scene.cycles.use_denoising = True
scene.render.resolution_x = 512
scene.render.resolution_y = 512
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.image_settings.color_depth = "8"
scene.render.image_settings.compression = 100
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "None"
scene.render.fps = 60
scene.frame_end = 38
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

paper = material("Matte white sticker stock", (0.92, 0.92, 0.9), 0.92)
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
rig = bpy.data.objects.new("Lift and settle - 620ms", None)
scene.collection.objects.link(rig)
for obj in [backing, cover]:
    obj.parent = rig
for frame, rotation, lift in [(1,(0,0,0),0),(13,(-7,5,-1.4),0.10),
                              (25,(2,-1,0.35),0.045),(38,(0,0,0),0)]:
    rig.rotation_euler = tuple(math.radians(v) for v in rotation)
    rig.location.z = lift
    rig.keyframe_insert(data_path="rotation_euler",frame=frame)
    rig.keyframe_insert(data_path="location",frame=frame)

camera_data = bpy.data.cameras.new("Sticker orthographic camera")
camera = bpy.data.objects.new("Sticker orthographic camera",camera_data)
scene.collection.objects.link(camera)
camera.location = (0,0,5)
camera.data.type = "ORTHO"
camera.data.ortho_scale = 2.012
scene.camera = camera
light_data = bpy.data.lights.new("Large soft window", "AREA")
light = bpy.data.objects.new("Large soft window",light_data)
scene.collection.objects.link(light)
light.location = (-1.4,1.8,4)
light.rotation_euler = (0,0,0)
light.data.energy = 140
light.data.size = 5

scene.frame_set(1)
cover.hide_render = True
scene.render.filepath = str(project / "public" / "cover-sticker-backing.png")
bpy.ops.render.render(write_still=True)
cover.hide_render = False
scene.frame_set(13)
bpy.ops.wm.save_as_mainfile(filepath=str(project / "design" / "cover-sticker.blend"))
print("STRIP_STICKER_READY")
