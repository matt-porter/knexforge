import os
import subprocess
import re
import csv
import sys

# --- Configuration ---
TEST_DIR = "test_images"
MODEL_PATH = "qwen/Qwen2-VL-7B-Instruct"
ADAPTER_PATH = "."
OUTPUT_CSV = "benchmark_results.csv"

# --- Prompts to Benchmark ---
PROMPT_SHORT = "Extract K'NEX topology."

PROMPT_LONG = """Extract K'NEX topology into strict shorthand.
RULES:
- Joints: Use '--' for fixed, '~~' for revolute.
- Connectors: format as [id]_[num].[port]. Valid IDs: rc3 (3-way), yc5 (5-way), wc8 (8-way). Ports are clockwise .A, .B, .C.
- Rods: format as [id]_[num].[port]. Valid IDs: gr (grey), wr (white). Ports are .end1, .end2, .center.
- Output ONLY the raw relationships, one per line. No markdown."""

def run_inference(image_path, prompt_text):
    """Runs the MLX CLI command and captures the output and metrics."""
    command = [
        sys.executable, "-m", "mlx_vlm.generate",
        "--model", MODEL_PATH,
        "--adapter-path", ADAPTER_PATH,
        "--image", image_path,
        "--prompt", prompt_text,
        "--max-tokens", "500"
    ]
    
    print(f"Running inference on {os.path.basename(image_path)}...")
    
    # Run the command and capture terminal output
    result = subprocess.run(command, capture_output=True, text=True)
    output = result.stdout
    
    # Fallback to stderr if MLX printed metrics there
    if "Peak memory" not in output:
        output += result.stderr

    # Parse Metrics using Regex
    gen_tps_match = re.search(r"Generation:.*?([\d.]+)\s*tokens-per-sec", output)
    memory_match = re.search(r"Peak memory:\s*([\d.]+)\s*GB", output)
    
    # Extract the actual AI response (everything between "assistant" and "==========")
    ai_response = "Error/Failed"
    response_match = re.search(r"<\|im_start\|>assistant(.*?)==========", output, re.DOTALL)
    if response_match:
        ai_response = response_match.group(1).strip()

    return {
        "Image": os.path.basename(image_path),
        "Generation_TPS": float(gen_tps_match.group(1)) if gen_tps_match else 0.0,
        "Peak_Memory_GB": float(memory_match.group(1)) if memory_match else 0.0,
        "Output": ai_response
    }

def main():
    if not os.path.exists(TEST_DIR):
        print(f"Error: Please create a '{TEST_DIR}' directory and add test images.")
        return

    images = [f for f in os.listdir(TEST_DIR) if f.endswith(('.jpg', '.png', '.jpeg'))]
    if not images:
        print(f"No images found in {TEST_DIR}.")
        return

    # Choose which prompt to test (Change this to PROMPT_LONG to test the dictionary)
    CURRENT_PROMPT = PROMPT_SHORT
    prompt_label = "Short" if CURRENT_PROMPT == PROMPT_SHORT else "Long/Dictionary"
    
    print(f"Starting Benchmark using the {prompt_label} prompt across {len(images)} images.\n")

    results = []
    for img in images:
        img_path = os.path.join(TEST_DIR, img)
        metrics = run_inference(img_path, CURRENT_PROMPT)
        results.append(metrics)
        
        # Print live results to terminal
        print(f" -> Speed: {metrics['Generation_TPS']} tps | RAM: {metrics['Peak_Memory_GB']} GB")
        print(f" -> Output Snippet: {metrics['Output'][:50]}...\n")

    # Save to CSV
    keys = results[0].keys()
    with open(OUTPUT_CSV, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=keys)
        writer.writeheader()
        writer.writerows(results)

    print(f"Benchmark complete! Results saved to {OUTPUT_CSV}")

if __name__ == "__main__":
    main()