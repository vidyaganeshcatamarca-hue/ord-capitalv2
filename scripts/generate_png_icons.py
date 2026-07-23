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
