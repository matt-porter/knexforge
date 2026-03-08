import os
import json
import random
import shutil

# --- Configuration ---
RAW_DATA_DIR = "raw_data"        # Where you drop your paired .jpg and .txt files
AUGMENTED_DATA_DIR = "augmented_data"        # Where you drop your paired .jpg and .txt files
OUTPUT_DIR = "data"              # The MLX target folder
OUTPUT_IMAGES_DIR = os.path.join(OUTPUT_DIR, "images")
USER_PROMPT_TEXT = "Extract K'NEX topology shorthand syntax." # The consistent instruction for the VLM
SYSTEM_PROMPT_TEXT_SHORT = "You are a raw K'NEX topology parser. Output ONLY the shorthand. No markdown, no explanations."
SYSTEM_PROMPT_TEXT_LONG = """Extract K'NEX topology into strict shorthand.
RULES:
- Joints: Use '--' for fixed, '~~' for revolute.
- Connectors: format as [part]_[num].[port]. Valid part IDs: gc2 (2-way 45 degree), oc2 (2-way straight), rc3 (3-way), gc4 (4-way) yc5 (5-way), wc8 (8-way). Ports are named clockwise .A, .B, .C...
- Rods: format as [part]_[num].[port]. Valid part IDs in size order: gsr, wr, br, yr, rr, gr. Ports are .end1, .end2, .center.
- Output ONLY the raw relationships, with the syntax <part>.<port> <joint> <part>.<port>. One connection per line.
"""
SYSTEM_PROMPT_NEW = "You are a strict K'NEX topology extractor. Output only raw shorthand syntax without markdown or description."

TRAIN_SPLIT = 0.8                # 80% for training, 20% for validation

def build_dataset():
    # 1. Setup fresh output directories
    if os.path.exists(OUTPUT_DIR):
        shutil.rmtree(OUTPUT_DIR)
    os.makedirs(OUTPUT_IMAGES_DIR)

    # 2. Find all matching image and text pairs in raw_data
    pairs = []
    for filename in os.listdir(AUGMENTED_DATA_DIR):
        if filename.endswith(('.jpg', '.jpeg', '.png')):
            base_name = os.path.splitext(filename)[0]
            txt_path = os.path.join(AUGMENTED_DATA_DIR, f"{base_name}.txt")
            img_path = os.path.join(AUGMENTED_DATA_DIR, filename)
            
            if os.path.exists(txt_path):
                pairs.append((img_path, txt_path, filename))
            else:
                print(f"Warning: Found {filename} but missing matching {base_name}.txt")

    if not pairs:
        print(f"No valid image/text pairs found in {AUGMENTED_DATA_DIR}. Exiting.")
        return
    
    print(f"Found {len(pairs)} augmented sketches. Preparing dataset...")

    # 3. Shuffle for randomized train/valid splitting
    random.shuffle(pairs)
    split_index = int(len(pairs) * TRAIN_SPLIT)
    train_pairs = pairs[:split_index]
    valid_pairs = pairs[split_index:]

    # 4. Helper function to write the JSONL files
    def write_jsonl(file_pairs, output_filename):
        jsonl_path = os.path.join(OUTPUT_DIR, output_filename)
        with open(jsonl_path, 'w', encoding='utf-8') as f:
            for img_path, txt_path, img_filename in file_pairs:
                # Copy image to the MLX data/images folder
                new_img_path = os.path.join(OUTPUT_IMAGES_DIR, img_filename)
                shutil.copy2(img_path, new_img_path)
                
                # Read your shorthand text
                with open(txt_path, 'r', encoding='utf-8') as tf:
                    lines = []
                    for line in tf.readlines():
                        if '#' in line: continue
                        lines.append(line.strip() + "\n")  # Ensure each line ends with a single newline
                    shorthand_content = "".join(lines).strip()
                
                # Construct the specific MLX-VLM JSON dictionary
                mlx_entry = {
                    "images": [f"data/images/{img_filename}"],
                    "messages": [
                        # {
                        #     "role": "system",
                        #     "content": [
                        #         {"type": "text", "text": SYSTEM_PROMPT_NEW}
                        #     ]
                        # },
                        {
                            "role": "user", 
                            "content": [
                                {"type": "text",  "text": USER_PROMPT_TEXT}, 
                                {"type": "image", "image": f"data/images/{img_filename}"}
                            ]
                        }, 
                        {
                            "role": "assistant", 
                            "content": [
                                {"type": "text",  "text": shorthand_content}
                            ]
                        }
                    ]
                }
                # Write as a single line
                f.write(json.dumps(mlx_entry) + '\n')
                
        print(f"Wrote {len(file_pairs)} items to {output_filename}")

    # 5. Execute
    write_jsonl(train_pairs, "train.jsonl")
    write_jsonl(valid_pairs, "valid.jsonl")
    print("\nDataset successfully built! You are ready to run the MLX training command.")

if __name__ == "__main__":
    build_dataset()