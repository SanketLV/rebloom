"""Generate landing-page photo candidates (hero and sections) with FLUX.1 [schnell] through a local ComfyUI.

Needs ComfyUI running on 127.0.0.1:8188 with the ComfyUI-GGUF node and these models:
  models/unet/flux1-schnell-Q5_K_S.gguf
  models/text_encoders/t5xxl_fp8_e4m3fn.safetensors, clip_l.safetensors
  models/vae/ae.safetensors
FLUX.1 [schnell] is Apache 2.0, so the images are fine for commercial use.

  python brand/source/flux_hero.py OUT_DIR [--seeds 3] [--sizes wide,tall] [--scenes sprout,lush]
"""
import argparse
import json
import pathlib
import time
import urllib.parse
import urllib.request

COMFY = "http://127.0.0.1:8188"

# Shared look: dark olive grounds, walnut soil, one fresh lime-green leaf, room for the headline.
LOOK = (
    "photorealistic macro photograph, shallow depth of field, soft rim light from the upper right, "
    "deep olive green shadows, muted earthy palette of olive, sage and walnut brown, "
    "a single fresh bright yellow-green new leaf as the only vivid colour, fine film grain, "
    "editorial still life, quiet and calm, no text, no people, no pot rim visible"
)

# Section photos: same palette, lighter and warmer, no lime rule (the symptoms need their real colours).
SECTION_LOOK = (
    "photorealistic photograph, natural soft window light, shallow depth of field, "
    "muted earthy palette of olive, sage and walnut brown, fine film grain, editorial still life, "
    "calm and quiet, no text, no logos"
)

SCENES = {
    # hero
    "unfurl": ("a new houseplant leaf unfurling from its stem, tiny water droplets on the leaf surface, "
               "an older leaf with a dry brown edge softly out of focus behind it", LOOK),
    "sprout": ("a fresh green shoot rising from dark damp soil beside a fallen dry brown leaf, "
               "low camera angle at soil level", LOOK),
    "monstera": ("close crop of a young monstera leaf opening, glossy surface catching light, "
                 "the rest of the frame falling into dark green shadow", LOOK),
    # field notes: one photo per symptom
    "sym-tips": ("close-up of a long green dracaena houseplant leaf whose tip is dry, brown and crispy, "
                 "the brown tip sharply in focus, plain soft background", SECTION_LOOK),
    "sym-yellow": ("a pothos houseplant in a terracotta pot where the two lowest leaves have turned yellow "
                   "while the upper leaves stay green, damp dark soil", SECTION_LOOK),
    "sym-mildew": ("close-up of a green zucchini-like leaf dusted with patches of white powdery mildew, "
                   "the white powder clearly visible on the leaf surface", SECTION_LOOK),
    # "fine webbing" alone gave clean healthy leaves; name the damage and the web explicitly.
    "sym-mites": ("macro of a sick houseplant leaf covered in dense fine white spider web strands stretched "
                  "across the leaf and stem, the leaf mottled with hundreds of tiny pale yellow stipple dots, "
                  "dull and dusty, clearly damaged", SECTION_LOOK),
    # how it works
    "step-scan": ("a hand holding a smartphone close to a single houseplant leaf to photograph it, "
                  "the phone screen facing away from the camera, indoor daylight", SECTION_LOOK),
    "step-answer": ("close-up of a fingertip pressed into the dark soil of a potted houseplant "
                    "to check if it is dry, terracotta pot rim", SECTION_LOOK),
    # Treat: scissors failed every time (impossible grips, warped blades), so these treatments need no blades.
    # Written to match Scan/Answer: one hand at most, close-up, warm window light, terracotta, centered subject.
    "treat-pinch": ("close-up photograph of a single hand gently pinching off one yellowed leaf at its stem from "
                    "an otherwise healthy green pothos in a terracotta pot, thumb and index finger holding the "
                    "short stem of the yellow leaf, the rest of the plant lush and green, soft warm window light "
                    "from the left, bright airy room, 85mm lens at f/2, background a softly blurred window",
                    SECTION_LOOK),
    "treat-wipe": ("close-up photograph of one large glossy green houseplant leaf resting on an open palm while "
                   "the other hand wipes its surface with a soft folded white cotton cloth, terracotta pot "
                   "blurred below, soft warm window light, 85mm lens at f/2", SECTION_LOOK),
    "treat-water": ("close-up photograph of a small brushed-steel watering can with a long thin spout pouring a "
                    "gentle stream of water onto dark soil at the base of a green houseplant in a terracotta pot "
                    "on a windowsill, the hand holding the can out of frame, only one watering can, droplets "
                    "catching soft warm morning light, 50mm lens at f/2.8", SECTION_LOOK),
    "treat-repot": ("close-up photograph of two hands lowering a small healthy houseplant with its compact root "
                    "ball of soil into a new terracotta pot half filled with fresh dark potting mix, on a light "
                    "wooden table by a window, soft warm light, 50mm lens at f/2.8", SECTION_LOOK),
    # promise and closing
    "promise": ("a healthy thriving houseplant in a ceramic pot on a wooden windowsill in warm late afternoon "
                "sunlight, amber and walnut tones", SECTION_LOOK),
    # step 4 pair: same seed, prompts identical except the plant's health, so pot, framing and light match.
    # (img2img on schnell either changes nothing or makes a new plant, so it isn't used here.)
    "day7": ("a healthy houseplant in a small terracotta pot, glossy upright green leaves standing tall, "
             "one bright fresh new leaf, the whole plant and pot in frame, dark olive background, "
             "soft rim light from the upper right, moody", SECTION_LOOK),
    "day1": ("a sick wilted houseplant in a small terracotta pot, limp yellowing leaves drooping down "
             "with brown crispy edges, no new leaf, the whole plant and pot in frame, dark olive background, "
             "soft rim light from the upper right, moody", SECTION_LOOK),
    "lush": ("lush healthy monstera and philodendron leaves filling the frame, glossy deep green leaves "
             "catching soft light, a few bright new leaves, deep olive shadows, dark and moody", LOOK),
}

# Desktop hero keeps the subject right and the lower left dark for the headline;
# the mobile cut puts the subject in the upper half, the headline sits below it.
SIZES = {
    "wide": (1600, 896, "subject placed far right at the right edge third of the frame, "
                        "the left two thirds dark and empty"),
    "tall": (896, 1600, "subject small and high in the top third of the frame, "
                        "the bottom two thirds dark and empty"),
    "portrait": (896, 1120, ""),
    "square": (1024, 1024, "subject centered"),
}


def workflow(prompt, width, height, seed, prefix, init_image=None, denoise=1.0):
    job = {
        "1": {"class_type": "UnetLoaderGGUF", "inputs": {"unet_name": "flux1-schnell-Q5_K_S.gguf"}},
        "2": {"class_type": "DualCLIPLoader", "inputs": {
            "clip_name1": "t5xxl_fp8_e4m3fn.safetensors", "clip_name2": "clip_l.safetensors", "type": "flux"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "ae.safetensors"}},
        "4": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["2", 0]}},
        "5": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["4", 0]}},
        "6": {"class_type": "EmptySD3LatentImage", "inputs": {"width": width, "height": height, "batch_size": 1}},
        # schnell is distilled: 4 steps, cfg 1, no negative prompt.
        "7": {"class_type": "KSampler", "inputs": {
            "model": ["1", 0], "positive": ["4", 0], "negative": ["5", 0], "latent_image": ["6", 0],
            "seed": seed, "steps": 4, "cfg": 1.0, "sampler_name": "euler", "scheduler": "simple", "denoise": denoise}},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["7", 0], "vae": ["3", 0]}},
        "9": {"class_type": "SaveImage", "inputs": {"images": ["8", 0], "filename_prefix": prefix}},
    }
    if init_image:
        # img2img: start from an existing photo so a before/after pair keeps the same plant and framing.
        job["10"] = {"class_type": "LoadImage", "inputs": {"image": init_image}}
        job["11"] = {"class_type": "VAEEncode", "inputs": {"pixels": ["10", 0], "vae": ["3", 0]}}
        job["7"]["inputs"]["latent_image"] = ["11", 0]
        # With only 4 steps denoise snaps between "unchanged" and "new plant"; 8 gives usable in-between strengths.
        job["7"]["inputs"]["steps"] = 8
    return job


def upload(path):
    boundary = "----rebloom" + str(int(time.time() * 1000))
    body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"{path.name}\"\r\n"
            f"Content-Type: image/png\r\n\r\n").encode() + path.read_bytes() + \
        f"\r\n--{boundary}\r\nContent-Disposition: form-data; name=\"overwrite\"\r\n\r\ntrue\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(COMFY + "/upload/image", data=body,
                                 headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())["name"]


def call(path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(COMFY + path, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as r:
        return r.read()


def run(job, out_path):
    prompt_id = json.loads(call("/prompt", {"prompt": job}))["prompt_id"]
    while True:
        hist = json.loads(call(f"/history/{prompt_id}")).get(prompt_id)
        if hist:
            status = hist.get("status", {})
            if status.get("status_str") == "error":
                raise RuntimeError(json.dumps(status.get("messages", []))[:800])
            images = [i for node in hist["outputs"].values() for i in node.get("images", [])]
            if images:
                img = images[0]
                q = urllib.parse.urlencode({k: img[k] for k in ("filename", "subfolder", "type")})
                out_path.write_bytes(call(f"/view?{q}"))
                return
        time.sleep(2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out_dir", type=pathlib.Path)
    ap.add_argument("--seeds", type=int, default=2)
    ap.add_argument("--sizes", default="wide,tall")
    ap.add_argument("--scenes", default="unfurl,sprout,monstera")
    ap.add_argument("--init", type=pathlib.Path, help="img2img source photo")
    ap.add_argument("--denoise", type=float, default=0.7, help="img2img strength, 0..1")
    args = ap.parse_args()
    args.out_dir.mkdir(parents=True, exist_ok=True)
    init = upload(args.init) if args.init else None
    for size in args.sizes.split(","):
        w, h, framing = SIZES[size]
        for name in args.scenes.split(","):
            scene, look = SCENES[name]
            for seed in range(1, args.seeds + 1):
                out = args.out_dir / f"{size}-{name}-{seed}.png"
                if out.exists():
                    continue
                t = time.time()
                prompt = ", ".join(p for p in (scene, framing, look) if p)
                run(workflow(prompt, w, h, seed, f"rebloom-{size}-{name}", init,
                             args.denoise if init else 1.0), out)
                print(f"{out.name}  {time.time() - t:.0f}s", flush=True)


if __name__ == "__main__":
    main()
