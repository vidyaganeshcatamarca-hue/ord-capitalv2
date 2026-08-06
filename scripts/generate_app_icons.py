import os
from PIL import Image, ImageDraw, ImageFilter
import numpy as np
from collections import deque

def generate_icons():
    # 1. Load source image from docs/icons/android-icon-512x512.png
    src_path = 'docs/icons/android-icon-512x512.png'
    if not os.path.exists(src_path):
        raise FileNotFoundError(f"Source file not found: {src_path}")
    
    src = Image.open(src_path).convert('RGB')
    arr = np.array(src, dtype=np.float32)
    h, w, _ = arr.shape

    # 2. Extract background mask via flood-fill from corners
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

    # 3. Create smooth alpha channel for emblem
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

    # 4. Dilate emblem mask to create small green rim after golden border
    emblem_img = Image.fromarray((emblem_mask * 255).astype(np.uint8))
    dilated_img = emblem_img.filter(ImageFilter.MaxFilter(17)) # ~8px rim
    dilated_mask = np.array(dilated_img) > 128

    # Green color: #267B23 (R=38, G=123, B=35)
    green_color = np.array([38, 123, 35], dtype=np.float32)

    logo_rgba = np.zeros((h, w, 4), dtype=np.uint8)
    logo_rgba[:, :, :3] = arr.astype(np.uint8)
    logo_rgba[:, :, 3] = alpha.astype(np.uint8)

    # Fill green rim where dilated_mask is active and emblem alpha is small
    green_ring_mask = dilated_mask & (logo_rgba[:, :, 3] < 200)
    for i in range(3):
        logo_rgba[:, :, i] = np.where(green_ring_mask, green_color[i], logo_rgba[:, :, i])

    dilated_alpha = Image.fromarray((dilated_mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.5))
    dilated_alpha_arr = np.array(dilated_alpha)
    logo_rgba[:, :, 3] = np.maximum(logo_rgba[:, :, 3], dilated_alpha_arr)

    emblem_with_rim = Image.fromarray(logo_rgba, 'RGBA')

    # A) public/logo.png (1024x1024 transparent)
    logo_1024 = emblem_with_rim.resize((1024, 1024), Image.Resampling.LANCZOS)
    logo_1024.save('public/logo.png', 'PNG')
    print('Generated public/logo.png (1024x1024)')

    # B) public/icono_logo.png (512x512 transparent)
    emblem_with_rim.save('public/icono_logo.png', 'PNG')
    print('Generated public/icono_logo.png (512x512)')

    # C) Main PWA Icons: public/icon-512.png, public/icon-192.png, public/apple-touch-icon.png, public/favicon.png
    # Dark green background: #0B380E (R=11, G=56, B=14)
    pwa_bg = Image.new('RGBA', (512, 512), (11, 56, 14, 255))
    # Place emblem with rim centered with 10% margin for maskable icon standards
    scaled_emblem = emblem_with_rim.resize((430, 430), Image.Resampling.LANCZOS)
    pwa_bg.paste(scaled_emblem, (41, 41), scaled_emblem)
    pwa_bg.save('public/icon-512.png', 'PNG')
    print('Generated public/icon-512.png (512x512)')

    icon_192 = pwa_bg.resize((192, 192), Image.Resampling.LANCZOS)
    icon_192.save('public/icon-192.png', 'PNG')
    print('Generated public/icon-192.png (192x192)')

    apple_touch = pwa_bg.resize((180, 180), Image.Resampling.LANCZOS)
    apple_touch.save('public/apple-touch-icon.png', 'PNG')
    print('Generated public/apple-touch-icon.png (180x180)')

    favicon = pwa_bg.resize((192, 192), Image.Resampling.LANCZOS)
    favicon.save('public/favicon.png', 'PNG')
    print('Generated public/favicon.png (192x192)')

    # D) Shortcut Icon: public/icon-shortcut-add.png (512x512) & public/icon-shortcut-add-192.png (192x192)
    # White background #FFFFFF
    shortcut_bg = Image.new('RGBA', (512, 512), (255, 255, 255, 255))
    # Paste emblem centered, scaled slightly so top-right area has room for yellow '+'
    emblem_shortcut = emblem_with_rim.resize((400, 400), Image.Resampling.LANCZOS)
    shortcut_bg.paste(emblem_shortcut, (56, 56), emblem_shortcut)

    # Draw vibrant yellow '+' badge in top-right corner
    draw = ImageDraw.Draw(shortcut_bg)
    # Badge circle: center=(410, 102), radius=48 -> bounding box (362, 54, 458, 150)
    cx, cy, r = 410, 102, 48
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill='#F5B041', outline='#D68910', width=3)
    
    # Plus sign inside circle (white or dark green)
    plus_len = 22
    plus_thick = 7
    # Vertical line
    draw.rectangle([cx - plus_thick//2, cy - plus_len, cx + plus_thick//2, cy + plus_len], fill='#1A1A1A')
    # Horizontal line
    draw.rectangle([cx - plus_len, cy - plus_thick//2, cx + plus_len, cy + plus_thick//2], fill='#1A1A1A')

    shortcut_bg.save('public/icon-shortcut-add.png', 'PNG')
    print('Generated public/icon-shortcut-add.png (512x512)')

    shortcut_192 = shortcut_bg.resize((192, 192), Image.Resampling.LANCZOS)
    shortcut_192.save('public/icon-shortcut-add-192.png', 'PNG')
    print('Generated public/icon-shortcut-add-192.png (192x192)')

if __name__ == '__main__':
    generate_icons()
