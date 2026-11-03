# Audio-to-video on the AKUSPACE i2v graph: the owner's track slice is encoded
# into LTX's audio latent and masked so the video is generated against it (the
# crowd moves to the real music). Two variants per shot:
#   cpu       audio mask 0: the track is kept as it is; the room reverb is added
#             afterwards on CPU by the World Builder IRs (room-reverb.sh).
#   akuspace  audio mask AKU (0.5): LTX with the AKUSPACE LoRA regenerates the track
#             partway, conditioned on the room (space_mode Room), so the room
#             character comes from the model instead of a convolution.
#   python3 -I make-a2v.py   (run on the box from /workspace)
import json, os

AKU = float(os.environ.get("AKU", "0.5"))
FPS, FRAMES = 24.0, 193
DUR = FRAMES / FPS
base = json.load(open("jobs/dive4-party.api.json"))
video_vae = base["62"]["inputs"]["vae"]  # the video VAE the decoder uses
shots = {
    "party": ("klein6-party.png", "arv2-03-party.wav", "medium_room",
              "The camera dives slowly down from above into a dense, packed daytime after-party in a big old plaster-walled room in New York. "
              "Dozens and dozens of young people stand close together holding cocktails and drinks, swaying, bouncing on their feet and nodding their heads to the rhythm of the music, "
              "hands down at their sides, chatting and laughing, a DJ at the turntables by the far wall, light haze in the sunlight from the tall windows. "
              "Continuous downward camera motion, no cuts. Photorealistic, shot on 35mm film."),
    "vocalist": ("klein6-vocalist.png", "arv2-04-studio.wav", "small_room",
                 "The camera descends slowly behind a female vocalist in a small warm recording room with wooden panelled walls, a drum kit on the left and a mixing console on the right. "
                 "She stands at a condenser microphone with a pop filter, wearing large studio headphones, listening to the music, not singing, her mouth closed. "
                 "Near the end she slowly turns her head over her shoulder, looks straight into the camera and smiles warmly. "
                 "Smooth continuous camera motion, no cuts. Photorealistic, shot on 35mm film, warm light."),
}


def mask(av, ref, init_audio):
    return {"class_type": "LTXVSetAudioVideoMaskByTime", "inputs": {
        "av_latent": av, "positive": [ref, 1], "negative": [ref, 2], "model": [ref, 0],
        "vae": video_vae, "audio_vae": ["5", 0], "start_time": 1 / FPS, "end_time": DUR,
        "video_fps": FPS, "mask_video": True, "mask_audio": False,
        "mask_init_value_video": 0.0, "mask_init_value_audio": init_audio, "slope_len": 3}}


for shot, (img, wav, room, prompt) in shots.items():
    for variant, init_audio in (("cpu", 0.0), ("akuspace", AKU)):
        g = json.loads(json.dumps(base))
        name = f"a2v-{shot}-{variant}"
        g["90"]["inputs"]["image"] = img
        g["30"]["inputs"]["value"] = FRAMES
        g["40"]["inputs"]["audio"] = wav
        g["41"]["inputs"]["duration"] = DUR
        t = g["12"]["inputs"]
        t["text"] = prompt
        if variant == "cpu":
            t["space_mode"] = "Off"
        else:
            t.update(space_mode="Room", room_preset=room, application="Heavy", effect_level="high", sfx_level="low")
        g["13"]["inputs"]["text"] = ("cut, shot change, scene change, static camera, hands in the air, raised arms, warped face, deformed hands, "
                                     "extra limbs, extra fingers, text, captions, watermark, distorted" + (", singing, open mouth" if shot == "vocalist" else ""))
        # the track, encoded, replaces the empty audio latent in stage 1
        g["a3"] = {"class_type": "LTXVAudioVAEEncode", "inputs": {"audio": ["41", 0], "audio_vae": ["5", 0]}}
        g["39"]["inputs"]["audio_latent"] = ["a3", 0]
        g["m1"] = mask(["39", 0], "42", init_audio)
        g["51"]["inputs"].update(positive=["m1", 0], negative=["m1", 1])
        g["54"]["inputs"]["latent_image"] = ["m1", 2]
        g["m2"] = mask(["72", 0], "42", init_audio)
        g["81"]["inputs"].update(positive=["m2", 0], negative=["m2", 1])
        g["84"]["inputs"]["latent_image"] = ["m2", 2]
        g["65"]["inputs"]["filename_prefix"] = "video/" + name
        g["66"]["inputs"]["filename_prefix"] = f"video/{name}_audio"
        json.dump(g, open(f"jobs/{name}.api.json", "w"))
        print(f"jobs/{name}.api.json")