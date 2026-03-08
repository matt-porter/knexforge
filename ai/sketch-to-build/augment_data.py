import os
import random
import shutil
from PIL import Image, ImageEnhance

# --- Configuration ---
INPUT_DIR = "raw_data"
OUTPUT_DIR = "augmented_data"
AUGMENTATIONS_PER_IMAGE = 8  # e.g., 1 original + 4 variants = 5 total per sketch
MAX_SIZE = 512

def augment_image(img, variant_num):
    """Applies random safe transformations to a PIL image."""
    # 1. Random Rotation (-15 to 15 degrees), filling background with white
    angle = random.uniform(-15, 15)
    img = img.rotate(angle, resample=Image.BICUBIC, expand=False, fillcolor=(255, 255, 255))
    
    # 2. Random Brightness (0.7x to 1.3x)
    brightness_factor = random.uniform(0.7, 1.3)
    enhancer = ImageEnhance.Brightness(img)
    img = enhancer.enhance(brightness_factor)
    
    # 3. Random Contrast (0.7x to 1.3x)
    contrast_factor = random.uniform(0.7, 1.3)
    enhancer = ImageEnhance.Contrast(img)
    img = enhancer.enhance(contrast_factor)
    
    return img

def main():
    if not os.path.exists(INPUT_DIR):
        print(f"Error: {INPUT_DIR} not found.")
        return

    # Create fresh output directory
    if os.path.exists(OUTPUT_DIR):
        shutil.rmtree(OUTPUT_DIR)
    os.makedirs(OUTPUT_DIR)

    # Find all image/text pairs
    pairs = []
    for filename in os.listdir(INPUT_DIR):
        if filename.endswith(('.jpg', '.jpeg', '.png')):
            base_name = os.path.splitext(filename)[0]
            txt_path = os.path.join(INPUT_DIR, f"{base_name}.txt")
            img_path = os.path.join(INPUT_DIR, filename)
            
            if os.path.exists(txt_path):
                pairs.append((img_path, txt_path, base_name))

    print(f"Found {len(pairs)} original sketches. Generating augmentations...")

    total_generated = 0
    for img_path, txt_path, base_name in pairs:
        # 1. Copy the original files first
        orig_img_out = os.path.join(OUTPUT_DIR, f"{base_name}_orig.jpg")
        orig_txt_out = os.path.join(OUTPUT_DIR, f"{base_name}_orig.txt")
        shutil.copy2(img_path, orig_img_out)
        shutil.copy2(txt_path, orig_txt_out)
        total_generated += 1

        # Read the text and image for variants
        with open(txt_path, 'r', encoding='utf-8') as f:
            shorthand_text_lines = f.readlines()
            
        with Image.open(img_path) as img:
            # Convert to RGB to ensure white background works during rotation
            img = img.convert("RGB") 
            if max(img.size) > MAX_SIZE:
                img.thumbnail((MAX_SIZE, MAX_SIZE), Image.Resampling.LANCZOS)
                img.save(orig_img_out, quality=90)  # Save resized original
            
            # 2. Generate variants
            for i in range(1, AUGMENTATIONS_PER_IMAGE + 1):
                variant_img = augment_image(img.copy(), i)
                
                # Save augmented image
                var_img_name = f"{base_name}_aug{i}.jpg"
                var_img_path = os.path.join(OUTPUT_DIR, var_img_name)
                variant_img.save(var_img_path, quality=90)
                
                # Save matching text file
                var_txt_name = f"{base_name}_aug{i}.txt"
                var_txt_path = os.path.join(OUTPUT_DIR, var_txt_name)
                with open(var_txt_path, 'w', encoding='utf-8') as f:
                    random.shuffle(shorthand_text_lines)
                    f.writelines(shorthand_text_lines)
                    
                total_generated += 1

    print(f"Success! Turned {len(pairs)} sketches into {total_generated} training examples in '{OUTPUT_DIR}'.")
    print("Next step: Change RAW_DATA_DIR in build_dataset.py to point to 'augmented_data'!")

if __name__ == "__main__":
    main()