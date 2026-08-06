import os
from PIL import Image

def publish_icons():
    green_src = 'scratch/preview_logo_green_95.png'
    white_src = 'scratch/preview_logo_white_95.png'

    if not os.path.exists(green_src):
        raise FileNotFoundError(f"Source file not found: {green_src}")
    if not os.path.exists(white_src):
        raise FileNotFoundError(f"Source file not found: {white_src}")

    green_img = Image.open(green_src).convert('RGBA')
    white_img = Image.open(white_src).convert('RGBA')

    os.makedirs('public', exist_ok=True)

    # 1. Green PWA Icons
    # A) logo.png (1024x1024)
    green_img.resize((1024, 1024), Image.Resampling.LANCZOS).save('public/logo.png', 'PNG')
    print('Saved public/logo.png (1024x1024)')

    # B) icono_logo.png (512x512)
    green_img.resize((512, 512), Image.Resampling.LANCZOS).save('public/icono_logo.png', 'PNG')
    print('Saved public/icono_logo.png (512x512)')

    # C) icon-512.png (512x512)
    green_img.resize((512, 512), Image.Resampling.LANCZOS).save('public/icon-512.png', 'PNG')
    print('Saved public/icon-512.png (512x512)')

    # D) icon-192.png (192x192)
    green_img.resize((192, 192), Image.Resampling.LANCZOS).save('public/icon-192.png', 'PNG')
    print('Saved public/icon-192.png (192x192)')

    # E) apple-touch-icon.png (180x180)
    green_img.resize((180, 180), Image.Resampling.LANCZOS).save('public/apple-touch-icon.png', 'PNG')
    print('Saved public/apple-touch-icon.png (180x180)')

    # F) favicon.png (192x192)
    green_img.resize((192, 192), Image.Resampling.LANCZOS).save('public/favicon.png', 'PNG')
    print('Saved public/favicon.png (192x192)')

    # 2. White Shortcut PWA Icons
    # A) icon-shortcut-add.png (512x512)
    white_img.resize((512, 512), Image.Resampling.LANCZOS).save('public/icon-shortcut-add.png', 'PNG')
    print('Saved public/icon-shortcut-add.png (512x512)')

    # B) icon-shortcut-add-192.png (192x192)
    white_img.resize((192, 192), Image.Resampling.LANCZOS).save('public/icon-shortcut-add-192.png', 'PNG')
    print('Saved public/icon-shortcut-add-192.png (192x192)')

if __name__ == '__main__':
    publish_icons()
