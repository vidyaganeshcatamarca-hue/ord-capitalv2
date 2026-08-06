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

# create_icon calls removed to preserve original graphical logo emblem in icon-192.png and icon-512.png


def create_shortcut_icon():
    base_logo = os.path.join(os.path.dirname(__file__), '../public/icono_logo.png')
    canvas = Image.new('RGBA', (512, 512), (255, 255, 255, 255))
    if os.path.exists(base_logo):
        # 96% of 512px canvas = 492px
        logo = Image.open(base_logo).convert('RGBA').resize((492, 492), Image.Resampling.LANCZOS)
        canvas.paste(logo, (10, 10), logo)
    
    draw = ImageDraw.Draw(canvas)
    badge_box = [405, 17, 495, 107]
    draw.ellipse(badge_box, fill=(245, 176, 65, 255), outline=(26, 26, 26, 255), width=6)
    
    try:
        font = ImageFont.truetype('arialbd.ttf', 65)
    except Exception:
        font = ImageFont.load_default()
        
    text = '+'
    bbox = draw.textbbox((0, 0), text, font=font)
    w_text = bbox[2] - bbox[0]
    h_text = bbox[3] - bbox[1]
    
    cx, cy = 450, 62
    x_text = cx - w_text / 2 - bbox[0]
    y_text = cy - h_text / 2 - bbox[1] - 3
    
    draw.text((x_text, y_text), text, fill=(26, 26, 26, 255), font=font)
    
    out_path = os.path.join(os.path.dirname(__file__), '../public/icon-shortcut-add.png')
    dist_path = os.path.join(os.path.dirname(__file__), '../dist/icon-shortcut-add.png')
    canvas.save(out_path, 'PNG')
    if os.path.exists(os.path.dirname(dist_path)):
        canvas.save(dist_path, 'PNG')
    print(f"Generated icon-shortcut-add.png (512x512) with 96% logo and top-right + badge at {out_path}")




create_shortcut_icon()


