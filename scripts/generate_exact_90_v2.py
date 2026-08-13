import os
from PIL import Image, ImageDraw, ImageFilter
import numpy as np
from collections import deque

def generate_exact_90_percent():
    src_path = 'docs/icons/android-icon-512x512.png'
    if not os.path.exists(src_path):
        raise FileNotFoundError(f"Source file not found: {src_path}")
    
    src = Image.open(src_path).convert('RGB')
    arr = np.array(src, dtype=np.float32)
    h, w, _ = arr.shape

    # Flood-fill background mask from corners
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

    alpha = np.zeros((h, w), dtype=np.float32)
    alpha[emblem_mask] = 255.0

    for r in range(1, h-1):
        for c in range(1, w-1):
            if bg_mask[r, c]:
                nbrs = emblem_mask[r-1:r+2, c-1:c+2]
                if np.any(nbrs):
                    d = dist[r, c]
                    a = max(0.0, min(255.0, (35.0 - d) / 35.0 * 255.0))
                    alpha[r, c] = a

    # Add green rim (#267B23)
    emblem_img = Image.fromarray((emblem_mask * 255).astype(np.uint8))
    dilated_img = emblem_img.filter(ImageFilter.MaxFilter(17)) # ~8px rim
    dilated_mask = np.array(dilated_img) > 128

    green_color = np.array([38, 123, 35], dtype=np.float32)

    logo_rgba = np.zeros((h, w, 4), dtype=np.uint8)
    logo_rgba[:, :, :3] = arr.astype(np.uint8)
    logo_rgba[:, :, 3] = alpha.astype(np.uint8)

    green_ring_mask = dilated_mask & (logo_rgba[:, :, 3] < 200)
    for i in range(3):
        logo_rgba[:, :, i] = np.where(green_ring_mask, green_color[i], logo_rgba[:, :, i])

    dilated_alpha = Image.fromarray((dilated_mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.5))
    dilated_alpha_arr = np.array(dilated_alpha)
    logo_rgba[:, :, 3] = np.maximum(logo_rgba[:, :, 3], dilated_alpha_arr)

    emblem_with_rim = Image.fromarray(logo_rgba, 'RGBA')

    os.makedirs('scratch', exist_ok=True)
    os.makedirs('public', exist_ok=True)

    # EXACT 90% EMBLEM SIZE: 461x461 px emblem in 512x512 canvas
    # Top-Left offset = (512 - 461) // 2 = 25px margin on all 4 sides.
    EMBLEM_SIZE = 461
    OFFSET = 25

    # 1. GREEN BACKGROUND ICON (512x512)
    # Background #0B380E (11, 56, 14)
    green_bg = Image.new('RGBA', (512, 512), (11, 56, 14, 255))
    scaled_emblem_green = emblem_with_rim.resize((EMBLEM_SIZE, EMBLEM_SIZE), Image.Resampling.LANCZOS)
    green_bg.paste(scaled_emblem_green, (OFFSET, OFFSET), scaled_emblem_green)

    # Save to scratch previews
    green_bg.save('scratch/preview_logo_green_90.png', 'PNG')
    green_bg.save('scratch/preview_logo_green_95.png', 'PNG')

    # Save to public PWA icons
    green_bg.save('public/icon-512.png', 'PNG')
    green_bg.save('public/icono_logo.png', 'PNG')

    green_1024 = green_bg.resize((1024, 1024), Image.Resampling.LANCZOS)
    green_1024.save('public/logo.png', 'PNG')

    green_192 = green_bg.resize((192, 192), Image.Resampling.LANCZOS)
    green_192.save('public/icon-192.png', 'PNG')
    green_192.save('public/favicon.png', 'PNG')

    apple_180 = green_bg.resize((180, 180), Image.Resampling.LANCZOS)
    apple_180.save('public/apple-touch-icon.png', 'PNG')

    print(f'Generated green PWA icons with emblem at exact 90% size ({EMBLEM_SIZE}x{EMBLEM_SIZE}px in 512x512)')

    # 2. WHITE BACKGROUND SHORTCUT ICON (512x512)
    # Emblem resized to 461x461px in 512x512 canvas
    white_bg = Image.new('RGBA', (512, 512), (255, 255, 255, 255))
    scaled_emblem_white = emblem_with_rim.resize((EMBLEM_SIZE, EMBLEM_SIZE), Image.Resampling.LANCZOS)
    white_bg.paste(scaled_emblem_white, (OFFSET, OFFSET), scaled_emblem_white)

    # Draw vibrant yellow '+' badge in top-right corner overlapping border
    draw = ImageDraw.Draw(white_bg)
    # Badge circle centered at top-right (435, 76), radius=52
    cx, cy, r = 435, 76, 52
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill='#F5B041', outline='#D68910', width=3)
    
    plus_len = 24
    plus_thick = 8
    draw.rectangle([cx - plus_thick//2, cy - plus_len, cx + plus_thick//2, cy + plus_len], fill='#1A1A1A')
    draw.rectangle([cx - plus_len, cy - plus_thick//2, cx + plus_len, cy + plus_thick//2], fill='#1A1A1A')

    # Save to scratch previews
    white_bg.save('scratch/preview_logo_white_90.png', 'PNG')
    white_bg.save('scratch/preview_logo_white_95.png', 'PNG')

    # Save to public shortcut icons
    white_bg.save('public/icon-shortcut-add.png', 'PNG')

    white_192 = white_bg.resize((192, 192), Image.Resampling.LANCZOS)
    white_192.save('public/icon-shortcut-add-192.png', 'PNG')

    print(f'Generated white shortcut PWA icons with emblem at exact 90% size ({EMBLEM_SIZE}x{EMBLEM_SIZE}px in 512x512)')

if __name__ == '__main__':
    generate_exact_90_percent()
