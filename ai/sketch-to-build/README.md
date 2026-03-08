Here is a complete, structured `README.md` for your project repository. It captures the entire architecture, the specific M4 MLX toolchain, and the dataset rules we developed.

You can copy and paste this directly into your project root.

---

# Sketch-to-Build: K'NEX VLM Topology Parser

**Sketch-to-Build** is a machine learning pipeline that uses a fine-tuned Vision-Language Model (VLM) to translate 2D hand-drawn sketches of K'NEX models into a strict, programmatic topological graph.

By separating the visual reasoning (topology) from the spatial mathematics (geometry), this pipeline allows an AI to reliably parse complex physical connections from messy sketches. The output is a lightweight shorthand that a downstream Forward Kinematics solver can convert into exact 3D coordinates (quaternions and positions).

## 🚀 Architecture: Separation of Concerns

1. **The AI (Perception):** A VLM fine-tuned to recognize K'NEX parts, ports, and joint types. It outputs a math-free topological shorthand (e.g., "Red rod connects to slot A of the 3-way connector").
2. **The Parser (Translation):** A standard Python script that reads the AI's shorthand and constructs a structured JSON graph (Parts and Connections).
3. **The Solver (Physics):** A deterministic engine that walks the JSON graph to calculate 15-decimal floating-point 3D geometry for rendering.

## 🛠 Hardware & Software Stack

* **Hardware:** Apple Silicon (Mac M4 with 48GB Unified Memory)
* **Framework:** [Apple MLX](https://github.com/ml-explore/mlx) (`mlx-vlm`)
* **Base Model:** Qwen2-VL-7B-Instruct (via Hugging Face)
* **Training Method:** LoRA (Low-Rank Adaptation)

## 🗂 The Shorthand Format

To reduce token count and prevent AI hallucinations, the model is trained to output a dense Graphviz-style shorthand rather than heavy JSON.

**Syntax Rules:**

* **Instances:** `[part_id]_[instance_number]` (e.g., `rc3_1` for Red 3-Way Connector instance 1).
* **Ports:** `.A`, `.B`, `.C` for connectors (clockwise from top). `.end1`, `.end2`, `.center` for rods.
* **Joints:** `--` for Fixed (snap) connections. `~~` for Revolute (slip/spinning) connections.

**Example (A Rectangle):**

```text
rc3_1.A -- gr_1.end1
gr_1.end2 -- rc3_2.C
rc3_2.A -- wr_1.end1
wr_1.end2 -- rc3_3.C
rc3_3.A -- gr_2.end1
gr_2.end2 -- rc3_4.C
rc3_4.A -- wr_2.end1
wr_2.end2 -- rc3_1.C

```

## 🎨 Dataset Generation Guidelines

For the model to learn efficiently, training sketches must follow a strict visual vocabulary.

1. **Rods:** Draw straight lines. Label the center with the instance ID (e.g., `gr_1`).
2. **Connectors:** Draw circles with protruding spokes matching the exact number of physical slots (e.g., 3 spokes for a 3-way). Write the instance ID next to it.
3. **Ports:** Explicitly write tiny letters (`A`, `B`, `C`) clockwise around the connector's connection points.
4. **Joint Cues:** For a revolute (spinning) joint, draw a small curved arrow `↺` where the rod passes through the connector hub.

## ⚙️ Setup & Installation

Create a virtual environment and install the MLX ecosystem optimized for Apple Silicon.

```bash
mkdir sketch-to-build
cd sketch-to-build
python3 -m venv .venv
source .venv/bin/activate

pip install mlx mlx-vlm transformers huggingface_hub pillow

```

## 🏃‍♂️ Pipeline Execution

### 1. Build the Dataset

Place your paired sketches (`sketch_001.jpg`) and shorthand text files (`sketch_001.txt`) into a folder named `raw_data/`. Then, run the dataset builder script to format them for MLX.

```bash
python build_dataset.py

```

*This generates a `data/` folder containing `train.jsonl`, `valid.jsonl`, and an `images/` directory.*

### 2. Fine-Tune the VLM (LoRA)

Kick off the training process using MLX. This will download the base Qwen2-VL model and train the adapter layers using your Mac's GPU.

```bash
.venv/bin/python -m mlx_vlm.lora \
    --model-path "qwen/Qwen2-VL-2B-Instruct" # or: Qwen/Qwen3.5-9B \
    --dataset "data/" \
    --batch-size 1 \
    --epochs 5 \
    --learning-rate 2e-5
```

This command/model 'works' - i.e. training runs

.venv/bin/python -m mlx_vlm.lora \
    --model-path "mlx-community/Qwen2-VL-2B-Instruct-4bit" \
    --dataset "data/" \
    --batch-size 1 \
    --epochs 10 \
    --learning-rate 2e-5

*The trained weights will be saved in the `adapters/` directory.*

### 3. Inference (Testing the Model)

Pass a brand-new sketch through your fine-tuned model to generate the topological shorthand.

```bash
.venv/bin/python -m mlx_vlm.generate \
    --model "mlx-community/Qwen2-VL-2B-Instruct-4bit" # or: Qwen/Qwen3.5-9B \ 
    --adapter-path . \
    --image "raw_data/splice1.png" \
    --system "You are a strict K'NEX topology extractor. Output only raw shorthand syntax without markdown or description." \
    --prompt "Extract K'NEX topology shorthand syntax." \
    --max-tokens 500

```

### 4. Parse to JSON

Take the generated shorthand text and pass it through `parser.py` (your Python conversion script) to extract the unique parts list and connection array for your downstream 3D solver.
