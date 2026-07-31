import os
from PIL import Image, ImageDraw, ImageFont

def create_icon(size, filename):
    img = Image.new('RGBA', (size, size), (26, 26, 26, 255))
    draw = ImageDraw.Draw(img)
    
    # Try to load a sans font, or default
    try:
        # Standard Windows fonts
        font_ord = ImageFont.truetype("arialbd.ttf", int(size * 0.28))
        font_cap = ImageFont.truetype("arialbd.ttf", int(size * 0.17))
    except Exception:
        font_ord = ImageFont.load_default()
        font_cap = ImageFont.load_default()

    # Draw ORD
    ord_text = "ORD"
    bbox_ord = draw.textbbox((0, 0), ord_text, font=font_ord)
    w_ord = bbox_ord[2] - bbox_ord[0]
    h_ord = bbox_ord[3] - bbox_ord[1]
    x_ord = (size - w_ord) / 2
    y_ord = size * 0.28

    draw.text((x_ord, y_ord), ord_text, fill=(0, 180, 216, 255), font=font_ord)

    # Draw Capital
    cap_text = "Capital"
    bbox_cap = draw.textbbox((0, 0), cap_text, font=font_cap)
    w_cap = bbox_cap[2] - bbox_cap[0]
    h_cap = bbox_cap[3] - bbox_cap[1]
    x_cap = (size - w_cap) / 2
    y_cap = size * 0.58

    draw.text((x_cap, y_cap), cap_text, fill=(255, 255, 255, 255), font=font_cap)

    out_path = os.path.join(os.path.dirname(__file__), '../public', filename)
    img.save(out_path, 'PNG')
    print(f"Generated {filename} ({size}x{size}) at {out_path}")

create_icon(192, 'icon-192.png')
create_icon(512, 'icon-512.png')

def create_shortcut_icon():
    base_path = os.path.join(os.path.dirname(__file__), '../public/icon-512.png')
    if os.path.exists(base_path):
        canvas = Image.open(base_path).convert('RGBA')
    else:
        canvas = Image.new('RGBA', (512, 512), (26, 26, 26, 255))
    
    draw = ImageDraw.Draw(canvas)
    badge_box = [315, 45, 445, 175]
    draw.ellipse(badge_box, fill=(78, 205, 196, 255), outline=(255, 255, 255, 255), width=8)
    
    try:
        font = ImageFont.truetype('arialbd.ttf', 90)
    except Exception:
        font = ImageFont.load_default()
        
    text = '+'
    bbox = draw.textbbox((0, 0), text, font=font)
    w_text = bbox[2] - bbox[0]
    h_text = bbox[3] - bbox[1]
    
    cx, cy = 380, 110
    x_text = cx - w_text / 2 - bbox[0]
    y_text = cy - h_text / 2 - bbox[1] - 4
    
    draw.text((x_text, y_text), text, fill=(26, 26, 26, 255), font=font)
    out_path = os.path.join(os.path.dirname(__file__), '../public/icon-shortcut-add.png')
    canvas.save(out_path, 'PNG')
    print(f"Generated icon-shortcut-add.png (512x512) with top-right + badge at {out_path}")

create_shortcut_icon()

