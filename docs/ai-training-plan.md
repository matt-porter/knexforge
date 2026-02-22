# AI Training Plan for K'NexForge

## Overview
We fork the official **BrickGPT / LegoGPT** project (CMU, ICCV 2025 Best Paper, repo: https://github.com/AvaLovelace1/BrickGPT, paper: https://arxiv.org/abs/2505.05469).  
Their autoregressive LLM + validity + rollback architecture is **perfect** for K'Nex and gives us ~70% of the AI code for free.

Key adaptation: replace LEGO grid + brick tokens with our **port-based JSON action stream**.

## Model Architecture
- **Base**: Llama-3.2-1B-Instruct (or Qwen2.5-3B-Instruct)  
- Fine-tune with **QLoRA** (4-bit) via Unsloth or TRL for speed  
- Only ~3–4M trainable parameters (LoRA rank 32 on query/value matrices)  
- Runs locally via Ollama on consumer GPUs/CPU

## Training Dataset: “StableText2K'Nex”
Target size: **60,000+** high-quality (prompt, action-sequence) pairs

**Generation pipeline** (run offline once):
1. Procedural + voxel-based creation using our Python core  
   - Start with ShapeNet/primitive meshes → voxelize  
   - Convert voxels to valid K'Nex rod/connector graphs (our snapping engine)  
   - Randomize layouts while preserving silhouette  
2. Stability filter: run full physics sim → keep only stable builds  
3. Caption generation: render 24 multi-view images → LLaVA-1.6 or GPT-4o/Claude-3.5  
4. Serialize action history as JSON Lines (exactly as in our schema)

**Instruction format** (identical to LegoGPT):

[USER] Create a K'Nex model of a tall red Ferris wheel with yellow supports and a stable base.
[ASSISTANT]
{"step":1,"action":"add_part",...}
{"step":2,"action":"add_rod",...}
...


## Fine-Tuning Details
- 3–5 epochs, AdamW, lr=2e-4, cosine scheduler  
- Structured output enforced via JSON mode + Outlines library (zero hallucinations)  
- Heavy weighting on “from_port” / “to_port” fields  
- Include negative examples (invalid snaps) for better rejection sampling

## Generation / Inference Loop (the magic)
```python
while not done:
    next_action = llm.predict(context)          # JSON guaranteed
    if core.is_valid(next_action, current_build):   # snapping + collision
        current_build.apply(next_action)
    else:
        reject_and_resample()                   # increase temp slightly

    if full_build and not core.is_stable():
        rollback_to_last_stable_prefix()        # exactly LegoGPT Algorithm 1