import os
from PIL import Image, ImageDraw, ImageFilter
import numpy as np
from collections import deque

def generate_87_and_login_logo():
    src_path = 'docs/icons/android-icon-512x512.png'
    if not os.path.exists(src_path):
        raise FileNotFoundError(f"Source file not found: {src_path}")
    
    src = Image.open(src_path).convert('RGB')
    arr = np.array(src, dtype=np.float32)
    h, w, _ = arr.shape

    # 1. Extract background mask via flood-fill from corners
    dist = np.sqrt(np.sum((arr - [255.0, 255.0, 255.0])**2, axis=2))
    bg_mask = np.zeros((h, w), dtype=bool)
    queue = deque([(0,0), (0, w-1), (h-1, 0), (h-1, w-1)])
    for r, c in queue:
        bg_mask[r, c] = True

    while queue:
        r, c = queue.popleft()
        for dr, dc in [(-1,0), (1,0), (0,-1), (0,1)]:
            nr, nc = r + dr, c + dc
            if 0 <= nr < h and 0 <= nc < w and not bg_mask[nr, nc]:
                if dist[nr, nc] < 35.0:
                    bg_mask[nr, nc] = True
                    queue.append((nr, nc))

    emblem_mask = ~bg_mask

    # Find tight bounding box of golden emblem circle
    rows = np.any(emblem_mask, axis=1)
    cols = np.any(emblem_mask, axis=0)
    rmin, rmax = np.where(rows)[0][[0, -1]]
    cmin, cmax = np.where(cols)[0][[0, -1]]

    alpha = np.zeros((h, w), dtype=np.float32)
    alpha[emblem_mask] = 255.0

    # Anti-alias boundary pixels
    for r in range(1, h-1):
        for c in range(1, w-1):
            if bg_mask[r, c]:
                nbrs = emblem_mask[r-1:r+2, c-1:c+2]
                if np.any(nbrs):
                    d = dist[r, c]
                    a = max(0.0, min(255.0, (35.0 - d) / 35.0 * 255.0))
                    alpha[r, c] = a

    # Fill green rim (#267B23) around gold ring edge
    emblem_img = Image.fromarray((emblem_mask * 255).astype(np.uint8))
    dilated_img = emblem_img.filter(ImageFilter.MaxFilter(17))
    dilated_mask = np.array(dilated_img) > 128

    green_color = np.array([38, 123, 35], dtype=np.float32)

    logo_rgba = np.zeros((h, w, 4), dtype=np.uint8)
    logo_rgba[:, :, :3] = arr.astype(np.uint8)
    logo_rgba[:, :, 3] = alpha.astype(np.uint8)

    green_ring_mask = dilated_mask & (logo_rgba[:, :, 3] < 200)
    for i in range(3):
        logo_rgba[:, :, i] = np.where(green_ring_mask, green_color[i], logo_rgba[:, :, i])

    dilated_alpha = Image.fromarray((dilated_mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.5))
    logo_rgba[:, :, 3] = np.maximum(logo_rgba[:, :, 3], np.array(dilated_alpha))

    emblem_full_rgba = Image.fromarray(logo_rgba, 'RGBA')

    # Crop tightly to golden emblem bounds
    crop_box = (max(0, cmin - 8), max(0, rmin - 8), min(w, cmax + 8), min(h, rmax + 8))
    cropped_emblem = emblem_full_rgba.crop(crop_box)

    os.makedirs('scratch', exist_ok=True)
    os.makedirs('public', exist_ok=True)

    # TARGET 1: PWA Icons at EXACT 87% CANVAS SIZE!
    # 87% of 512 = 445px. Offset = (512 - 445) // 2 = 33px margin
    TARGET_EMBLEM_87 = 445
    OFFSET_87 = 33

    scaled_golden_87 = cropped_emblem.resize((TARGET_EMBLEM_87, TARGET_EMBLEM_87), Image.Resampling.LANCZOS)

    # A) GREEN PWA ICON (512x512)
    green_bg = Image.new('RGBA', (512, 512), (11, 56, 14, 255))
    green_bg.paste(scaled_golden_87, (OFFSET_87, OFFSET_87), scaled_golden_87)

    # Save PNG and WebP previews
    green_bg.save('scratch/preview_logo_green_87.png', 'PNG')
    green_bg.save('scratch/preview_logo_green_87.webp', 'WEBP', quality=95)
    green_bg.save('scratch/preview_logo_green_90.png', 'PNG')
    green_bg.save('scratch/preview_logo_green_95.png', 'PNG')

    # Save to public PWA icons
    green_bg.save('public/icon-512.png', 'PNG')
    green_bg.save('public/icono_logo.png', 'PNG')
    green_bg.save('public/icono_logo.webp', 'WEBP', quality=95)

    green_1024 = green_bg.resize((1024, 1024), Image.Resampling.LANCZOS)
    green_1024.save('public/logo.png', 'PNG')
    green_1024.save('public/logo.webp', 'WEBP', quality=95)

    green_192 = green_bg.resize((192, 192), Image.Resampling.LANCZOS)
    green_192.save('public/icon-192.png', 'PNG')
    green_192.save('public/favicon.png', 'PNG')

    apple_180 = green_bg.resize((180, 180), Image.Resampling.LANCZOS)
    apple_180.save('public/apple-touch-icon.png', 'PNG')

    print("Generated Green PWA assets (PNG + WebP) with Golden Emblem at EXACT 87% canvas size!")

    # B) WHITE SHORTCUT PWA ICON (512x512)
    white_bg = Image.new('RGBA', (512, 512), (255, 255, 255, 255))
    white_bg.paste(scaled_golden_87, (OFFSET_87, OFFSET_87), scaled_golden_87)

    draw = ImageDraw.Draw(white_bg)
    cx, cy, r = 438, 74, 54
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill='#F5B041', outline='#D68910', width=3)
    
    plus_len = 24
    plus_thick = 8
    draw.rectangle([cx - plus_thick//2, cy - plus_len, cx + plus_thick//2, cy + plus_len], fill='#1A1A1A')
    draw.rectangle([cx - plus_len, cy - plus_thick//2, cx + plus_len, cy + plus_thick//2], fill='#1A1A1A')

    white_bg.save('scratch/preview_logo_white_87.png', 'PNG')
    white_bg.save('scratch/preview_logo_white_87.webp', 'WEBP', quality=95)
    white_bg.save('scratch/preview_logo_white_90.png', 'PNG')
    white_bg.save('scratch/preview_logo_white_95.png', 'PNG')

    white_bg.save('public/icon-shortcut-add.png', 'PNG')
    white_bg.save('public/icon-shortcut-add.webp', 'WEBP', quality=95)

    white_192 = white_bg.resize((192, 192), Image.Resampling.LANCZOS)
    white_192.save('public/icon-shortcut-add-192.png', 'PNG')
    white_192.save('public/icon-shortcut-add-192.webp', 'WEBP', quality=95)

    print("Generated White Shortcut PWA assets (PNG + WebP) with Golden Emblem at EXACT 87% canvas size!")

    # TARGET 2: DEDICATED LOGIN LOGO (logo_login.webp) WITH SLOW RADIAL ALPHA FADE OUTSIDE GOLDEN EMBLEM
    # Canvas 512x512 transparent
    login_img = Image.new('RGBA', (512, 512), (0, 0, 0, 0))
    # Fill green background #0B380E
    green_layer = Image.new('RGBA', (512, 512), (11, 56, 14, 255))
    # Paste golden emblem centered (400x400)
    scaled_login_emblem = cropped_emblem.resize((400, 400), Image.Resampling.LANCZOS)
    green_layer.paste(scaled_login_emblem, (56, 56), scaled_login_emblem)

    # Generate smooth radial alpha mask that:
    # - Is 100% solid opaque from center (0) to golden ring edge (~180px radius)
    # - Gradually, linearly fades from 100% alpha down to 0% alpha between radius 180px and 250px!
    Y, X = np.ogrid[:512, :512]
    dist_from_center = np.sqrt((X - 256)**2 + (Y - 256)**2)

    # Smooth transition zone
    r_inner = 170.0 # start of fade (just at outer edge of gold ring)
    r_outer = 250.0 # end of fade (outer transparent edge)

    alpha_mask = np.ones((512, 512), dtype=np.float32)
    fade_zone = (dist_from_center > r_inner) & (dist_from_center <= r_outer)
    outer_zone = dist_from_center > r_outer

    # Smooth cosine fade from 1.0 to 0.0
    progress = (dist_from_center[fade_zone] - r_inner) / (r_outer - r_inner)
    alpha_mask[fade_zone] = 0.5 * (1.0 + np.cos(progress * np.pi))
    alpha_mask[outer_zone] = 0.0

    # Apply alpha mask to green_layer
    green_arr = np.array(green_layer)
    green_arr[:, :, 3] = (green_arr[:, :, 3].astype(np.float32) * alpha_mask).astype(np.uint8)

    login_final = Image.fromarray(green_arr, 'RGBA')
    login_final.save('scratch/logo_login_fade.webp', 'WEBP', quality=95)
    login_final.save('public/logo_login.webp', 'WEBP', quality=95)

    print("Generated public/logo_login.webp with ultra-smooth radial alpha fade!")

if __name__ == '__main__':
    generate_87_and_login_logo()
