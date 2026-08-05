import os
from PIL import Image

CANVAS_SIZE = (1280, 800)
BG_COLOR = (0xED, 0xED, 0xEA)
MARGIN = 60

SRC_DIR = os.path.join(os.path.dirname(__file__), "..", "assets")
DEST_DIR = os.path.join(os.path.expanduser("~"), "Desktop", "store-screenshots")

MAPPING = [
    ("screenshot-hero.png", "store-1-hero.png"),
    ("screenshot-light.png", "store-2-sidebar.png"),
    ("screenshot-dark.png", "store-3-dark.png"),
    ("screenshot-collapsed.png", "store-4-collapsed.png"),
    ("state-empty.png", "store-5-empty.png"),
]

os.makedirs(DEST_DIR, exist_ok=True)

max_w = CANVAS_SIZE[0] - 2 * MARGIN
max_h = CANVAS_SIZE[1] - 2 * MARGIN

for src_name, dest_name in MAPPING:
    src_path = os.path.join(SRC_DIR, src_name)
    dest_path = os.path.join(DEST_DIR, dest_name)

    img = Image.open(src_path).convert("RGB")
    scale = min(max_w / img.width, max_h / img.height)
    new_size = (max(1, round(img.width * scale)), max(1, round(img.height * scale)))
    resized = img.resize(new_size, Image.LANCZOS)

    canvas = Image.new("RGB", CANVAS_SIZE, BG_COLOR)
    x = (CANVAS_SIZE[0] - new_size[0]) // 2
    y = (CANVAS_SIZE[1] - new_size[1]) // 2
    canvas.paste(resized, (x, y))

    canvas.save(dest_path, "PNG")
    print(f"{dest_name}: size={canvas.size}, mode={canvas.mode}")
