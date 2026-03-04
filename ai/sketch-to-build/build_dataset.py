import os
import json
import random
import shutil

# --- Configuration ---
RAW_DATA_DIR = "raw_data"        # Where you drop your paired .jpg and .txt files
OUTPUT_DIR = "data"              # The MLX target folder
OUTPUT_IMAGES_DIR = os.path.join(OUTPUT_DIR, "images")
PROMPT_TEXT = "Extract K'NEX topology." # The consistent instruction for the VLM
TRAIN_SPLIT = 0.8                # 80% for training, 20% for validation

def build_dataset():
    # 1. Setup fresh output directories
    if os.path.exists(OUTPUT_DIR):
        shutil.rmtree(OUTPUT_DIR)
    os.makedirs(OUTPUT_IMAGES_DIR)

    # 2. Find all matching image and text pairs in raw_data
    pairs = []
    for filename in os.listdir(RAW_DATA_DIR):
        if filename.endswith(('.jpg', '.jpeg', '.png')):
            base_name = os.path.splitext(filename)[0]
            txt_path = os.path.join(RAW_DATA_DIR, f"{base_name}.txt")
            img_path = os.path.join(RAW_DATA_DIR, filename)
            
            if os.path.exists(txt_path):
                pairs.append((img_path, txt_path, filename))
            else:
                print(f"Warning: Found {filename} but missing matching {base_name}.txt")

    if not pairs:
        print(f"No valid image/text pairs found in {RAW_DATA_DIR}. Exiting.")
        return

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
                    shorthand_content = tf.read().strip()
                
                # Construct the specific MLX-VLM JSON dictionary
                # Notice we use the relative path 'data/images/...' as MLX expects
                mlx_entry = {
                    "messages": [
                        {
                            "role": "user", 
                            "content": [
                                {"type": "text", "text": PROMPT_TEXT}, 
                                {"type": "image", "image": f"data/images/{img_filename}"}
                            ]
                        }, 
                        {
                            "role": "assistant", 
                            "content": shorthand_content
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