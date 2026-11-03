# Three World Builder scenes for the adaptive-reverb dive, written as move-library
# recipes: the skydive camera (a follow shot on a face-down falling mannequin)
# drops into each room's own walls and floor, so the Acoustics node computes the
# same room as the fall-* takes. One animated avatar per recipe, so people are
# primitives: cylinders that orbit slightly around their own spot to sway.
#   python3 -I make-dive-scenes.py <moves dir>
import copy, json, math, random, sys

moves = sys.argv[1]
load = lambda n: json.load(open(f"{moves}/{n}.json"))
sky = load("skydive-cathedral")
FRAMES = 193


def dive(room, start_y, objects, prompt, name, z=-1, yaw=0):
    r = copy.deepcopy(sky)
    r["frames"] = FRAMES
    r["objects"] = objects
    r["avatarMotion"] = [{"clip": "jump-air", "seconds": FRAMES / 24}]
    r["avatarPose"] = {"x": 0, "y": start_y, "z": z, "yaw": yaw, "pitch": math.pi / 2}
    r["avatarPath"] = [{"frame": FRAMES - 1, "pose": {"x": 0, "y": 0.1, "z": z, "yaw": yaw, "pitch": math.pi / 2}, "ease": "fall"}]
    r["targetY"] = start_y - 4
    r["depthFar"] = max(40, start_y + 20)
    r["prompt"] = f"Move library · {name}: {prompt}"
    json.dump(r, open(f"{moves}/{name}.json", "w"), indent=2)
    return name


def figure(i, x, z, h, color, prompt, sway):
    p = {"id": f"person-{i}", "shape": "cylinder", "x": x, "y": h / 2, "z": z, "scale": 1,
         "scaleX": 0.22, "scaleY": h / 2, "scaleZ": 0.22, "rotation": 0, "rotationX": 0,
         "spin": 0, "color": color, "prompt": prompt}
    if sway:
        p.update(orbit=sway, orbitX=round(x + 0.15, 3), orbitZ=z)
    return p


cathedral = load("fall-cathedral")["objects"]
medium = load("fall-medium-room")["objects"]
small = load("fall-small-room")["objects"]

# Cathedral: empty of people, but an acoustic layout to test the Acoustics node:
# two rows of stone columns down the nave, pew blocks either side and an altar.
cathedral = list(cathedral)
for i, z in enumerate((-11, -6.5, -2, 2.5, 7)):
    for side, x in (("w", -3.6), ("e", 3.6)):
        cathedral.append({"id": f"column-{side}{i}", "shape": "cylinder", "x": x, "y": 6, "z": z, "scale": 1,
                          "scaleX": 0.7, "scaleY": 6, "scaleZ": 0.7, "rotation": 0, "rotationX": 0, "spin": 0,
                          "color": "#a39a8a", "prompt": "a massive gothic stone column"})
for i, (x, z) in enumerate(((-1.9, -4), (1.9, -4), (-1.9, 3), (1.9, 3))):
    cathedral.append({"id": f"pews-{i}", "shape": "box", "x": x, "y": 0.45, "z": z, "scale": 1, "scaleX": 2.4,
                      "scaleY": 0.9, "scaleZ": 5, "rotation": 0, "rotationX": 0, "spin": 0, "color": "#5b4330",
                      "prompt": "rows of dark wooden pews"})
cathedral.append({"id": "altar", "shape": "box", "x": 0, "y": 0.6, "z": -13, "scale": 1, "scaleX": 3, "scaleY": 1.2,
                  "scaleZ": 1.2, "rotation": 0, "rotationX": 0, "spin": 0, "color": "#d8d0c0", "prompt": "a stone altar"})
dive("cathedral", 30, cathedral, "the camera dives through the open roof into an empty gothic cathedral and falls down the nave to the stone floor.", "dive-cathedral")

# Big room: a daytime party, 16 dancers around the landing spot and a DJ table.
random.seed(7)
party = list(medium)
spots = [(x, z) for x in (-2.3, -1.2, 1.2, 2.3) for z in (-3.6, -2.2, 0.2, 1.6)]
for i, (x, z) in enumerate(spots):
    x += random.uniform(-0.3, 0.3); z += random.uniform(-0.3, 0.3)
    party.append(figure(i, round(x, 2), round(z, 2), round(random.uniform(1.6, 1.85), 2),
                        random.choice(["#c4573a", "#3a6ec4", "#e0c341", "#7a3ac4", "#3ac48a"]),
                        "a young person dancing at a daytime rave, hands in the air",
                        round(random.choice([-1, 1]) * random.uniform(0.6, 1.0), 2)))
party.append({"id": "dj-table", "shape": "box", "x": 0, "y": 0.45, "z": -4.2, "scale": 1, "scaleX": 1.6,
              "scaleY": 0.9, "scaleZ": 0.6, "rotation": 0, "rotationX": 0, "spin": 0, "color": "#222222",
              "prompt": "a DJ table with turntables and a mixer"})
dive("medium_room", 16, party, "the camera falls through the ceiling into a big plaster room packed with a daytime after-party, dozens of people dancing.", "dive-party-room")

# Small room: a recording studio, one vocalist with her back to the camera at a microphone.
# The skydive follow camera trails 4.5 m behind the faller in world -z (yaw does not turn
# it), and the room is 3.2 m deep, so the room is mirrored: its back wall moves to +z and
# the open side faces the camera, which looks in over the vocalist's shoulders.
studio = [dict(o, z=-o["z"]) for o in small]
studio.append(figure("vocalist", 0, 0.35, 1.68, "#1d1d1f", "a female vocalist with her back to the camera, wearing headphones, singing", 0))
studio.append({"id": "mic-stand", "shape": "cylinder", "x": 0, "y": 0.8, "z": 0.95, "scale": 0.5, "scaleX": 0.1,
               "scaleY": 1.6, "scaleZ": 0.1, "rotation": 0, "rotationX": 0, "spin": 0, "color": "#999999",
               "prompt": "a condenser microphone with a pop filter on a stand"})
dive("small_room", 9, studio, "the camera falls into a small recording studio behind a vocalist singing at a microphone.", "dive-studio", z=1.0)
print("wrote dive-cathedral dive-party-room dive-studio")