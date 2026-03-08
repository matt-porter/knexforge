"""
K'NEX Sketch-to-Build: VLM Fine-Tuning on Apple Silicon

Fine-tunes a Qwen2-VL vision-language model using mlx_vlm's native LoRA trainer
to read sketches of K'NEX models and output topology shorthand.

Dataset: data/train.jsonl (JSONL with "images" + "messages" columns)
Output:  outputs/adapters.safetensors

Usage:
    # From ai/sketch-to-build/ with local .venv activated:
    python mlx_finetune.py                  # train + inference test
    python mlx_finetune.py --skip-training  # inference-only (loads saved adapters)
    python mlx_finetune.py --epochs 3       # more epochs
"""

import argparse
import os

import mlx.core as mx
import mlx.optimizers as optim
from datasets import load_dataset

from mlx_vlm import load, generate
from mlx_vlm.prompt_utils import apply_chat_template
from mlx_vlm.trainer import (
    VisionDataset,
    TrainingArgs,
    save_adapter,
    train,
    find_all_linear_names,
    get_peft_model,
    apply_lora_layers,
)
from mlx_vlm.utils import load_config, prepare_inputs


class ImageVisionDataset(VisionDataset):
    """VisionDataset subclass that always loads images for Qwen models.

    The upstream VisionDataset sets images=None for Qwen/Gemma models
    (use_embedded_images=True), which means no pixel_values are produced
    and the model trains on text tokens only. This subclass overrides
    process() to always pass images to prepare_inputs.
    """

    def process(self, item):
        from mlx_vlm.trainer.datasets import get_prompt

        images = item.get("images", item.get("image", []))
        if not isinstance(images, list):
            images = [images] if images else []

        audio = item.get("audio", item.get("audios", []))
        if not isinstance(audio, list):
            audio = [audio] if audio else []

        # Clean messages in-process (HF Arrow serialization restores null fields)
        conversations = item.get("messages", item.get("conversations"))
        cleaned_convos = []
        for msg in conversations:
            content = msg["content"]
            if isinstance(content, list):
                content = [{k: v for k, v in ci.items() if v is not None} for ci in content]
            cleaned_convos.append({"role": msg["role"], "content": content})
        conversations = cleaned_convos

        model_type = self.config.get("model_type")

        prompts = []
        if isinstance(conversations, list) and isinstance(conversations[0], list):
            for conversation in conversations:
                prompt = get_prompt(model_type, self.processor, conversation)
                prompts.append(prompt)
        else:
            prompt = get_prompt(model_type, self.processor, conversations)
            prompts.append(prompt)

        image_token_index = self.config.get("image_token_index") or self.config.get(
            "image_token_id"
        )
        if not image_token_index:
            raise ValueError("Config must contain 'image_token_index' or 'image_token_id'")

        # Always pass images — do NOT skip for Qwen models
        inputs = prepare_inputs(
            processor=self.processor,
            images=images if images else None,
            audio=audio if audio else None,
            prompts=prompts,
            image_token_index=image_token_index,
            resize_shape=self.image_resize_shape,
        )

        # Squeeze leading batch dim so iterate_batches computes lengths correctly.
        # prepare_inputs returns (1, seq_len); iterate_batches expects (seq_len,).
        def _squeeze(x):
            if isinstance(x, mx.array) and x.ndim >= 2 and x.shape[0] == 1:
                return x.squeeze(0)
            return x

        return {
            "pixel_values": inputs.get("pixel_values"),
            "input_ids": _squeeze(inputs["input_ids"]),
            "attention_mask": _squeeze(
                inputs.get("attention_mask", mx.ones_like(inputs["input_ids"]))
            ),
            **{
                k: _squeeze(v) if isinstance(v, mx.array) else v
                for k, v in inputs.items()
                if k not in ["input_ids", "pixel_values", "attention_mask"]
            },
        }


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
MODEL_PATH = "mlx-community/Qwen2-VL-2B-Instruct-4bit"
DATASET_DIR = "./data"
OUTPUT_DIR = "outputs"
ADAPTER_FILE = os.path.join(OUTPUT_DIR, "adapters.safetensors")

LORA_RANK = 16
LORA_ALPHA = 16
LORA_DROPOUT = 0.0
LEARNING_RATE = 2e-5   # 1e-4 causes NaN loss; 2e-5 is stable for 4-bit VLMs
BATCH_SIZE = 1         # VLMs are memory-heavy; 1 is safest on most Macs
EPOCHS = 1
PRINT_EVERY = 10
TEST_IMAGE = "data/images/Tjunc2_orig.jpg"


def parse_args():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--model", default=MODEL_PATH, help="HF model id or local path")
    p.add_argument("--dataset", default=DATASET_DIR)
    p.add_argument("--epochs", type=int, default=EPOCHS)
    p.add_argument("--batch-size", type=int, default=BATCH_SIZE)
    p.add_argument("--lr", type=float, default=LEARNING_RATE)
    p.add_argument("--lora-rank", type=int, default=LORA_RANK)
    p.add_argument("--lora-alpha", type=float, default=LORA_ALPHA)
    p.add_argument("--steps", type=int, default=0, help="Steps per epoch (0 = full dataset)")
    p.add_argument("--adapter-path", default=None, help="Resume from saved adapter")
    p.add_argument("--skip-training", action="store_true", help="Skip training, run inference only")
    p.add_argument("--test-image", default=TEST_IMAGE)
    return p.parse_args()


def main():
    args = parse_args()
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # ── Step 1: Load model ─────────────────────────────────────────────────
    print(f"\n[1/5] Loading model: {args.model}")
    model, processor = load(
        args.model,
        processor_config={"trust_remote_code": True},
    )
    config = model.config.__dict__
    print(f"  ✓ Model loaded ({config.get('model_type', '?')})")

    # ── Step 2: Apply LoRA ─────────────────────────────────────────────────
    print("\n[2/5] Applying LoRA adapters...")
    if args.adapter_path or (args.skip_training and os.path.exists(ADAPTER_FILE)):
        adapter = args.adapter_path or os.path.dirname(ADAPTER_FILE)
        print(f"  Resuming from adapter: {adapter}")
        model = apply_lora_layers(model, adapter)
    else:
        linear_layers = find_all_linear_names(model.language_model)
        model = get_peft_model(
            model,
            linear_layers,
            rank=args.lora_rank,
            alpha=args.lora_alpha,
            dropout=LORA_DROPOUT,
        )
    print("  ✓ LoRA configured")

    # ── Step 3: Load dataset ───────────────────────────────────────────────
    if not args.skip_training:
        print(f"\n[3/5] Loading dataset from {args.dataset}")
        hf_train = load_dataset(args.dataset, split="train")
        train_dataset = ImageVisionDataset(hf_train, config, processor)
        print(f"  ✓ {len(train_dataset)} training examples")

        hf_valid = load_dataset(args.dataset, split="validation")
        val_dataset = ImageVisionDataset(hf_valid, config, processor)
        print(f"  ✓ {len(val_dataset)} validation examples")

        # ── Step 4: Train ──────────────────────────────────────────────────
        print("\n[4/5] Training...")

        iters = args.steps if args.steps > 0 else len(train_dataset) // args.batch_size
        training_args = TrainingArgs(
            batch_size=args.batch_size,
            iters=iters,
            learning_rate=args.lr,
            adapter_file=ADAPTER_FILE,
            steps_per_report=PRINT_EVERY,
            steps_per_eval=max(50, iters // 5),  # validate ~5 times per epoch
            steps_per_save=iters,  # save once at the end
            grad_checkpoint=False,
            grad_clip=1.0,
            warmup_steps=min(50, iters // 10),
            min_learning_rate=1e-6,
        )

        optimizer = optim.Adam(learning_rate=args.lr)
        model.train()

        for epoch in range(args.epochs):
            print(f"  Epoch {epoch + 1}/{args.epochs}")
            train(
                model,
                optimizer,
                train_dataset,
                val_dataset=val_dataset,
                args=training_args,
                train_on_completions=True,
            )

        save_adapter(model, ADAPTER_FILE)
        print(f"  ✓ Adapter saved to {ADAPTER_FILE}")
    else:
        print("\n[3/5] Skipping dataset load (--skip-training)")
        print("[4/5] Skipping training (--skip-training)")

    # ── Step 5: Inference test ─────────────────────────────────────────────
    print("\n[5/5] Running inference test...")
    model.eval()

    prompt = "Extract K'NEX topology shorthand syntax."
    formatted_prompt = apply_chat_template(
        processor, config, prompt, num_images=1
    )

    result = generate(
        model,
        processor,
        formatted_prompt,
        image=args.test_image,
        max_tokens=200,
        verbose=False,
    )

    print(f"\n  Image: {args.test_image}")
    print(f"  Prompt: {prompt}")
    print(f"  Response:\n{result.text}")
    print("\nDone.")


if __name__ == "__main__":
    main()
