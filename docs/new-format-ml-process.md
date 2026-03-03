Here is the comprehensive summary of our entire architectural discussion and technical roadmap for fine-tuning a Vision-Language Model (VLM) to parse hand-drawn K'NEX sketches into structural code on your Mac M4.

### ---

**Phase 1: The Core Problem & Hardware Setup**

**The User Goal:** You wanted to train an AI to look at drawn sketches and output a highly specific custom format representing K'NEX models, using an M4 Mac with 48GB of unified memory.  
**The AI Solution:** Standard LLMs won't work; you need a Vision-Language Model (VLM). The Mac M4 is perfect for this because its unified memory allows you to load large models without a dedicated Nvidia GPU.

* **Recommended Models:** Qwen2-VL (7B) or Llama 3.2 Vision (11B).  
* **The Framework:** Apple MLX (mlx-vlm), an optimized framework for Apple Silicon.  
* **The Method:** LoRA (Low-Rank Adaptation), which freezes the base model and only trains a lightweight adapter layer, saving massive amounts of RAM and compute.

### **Phase 2: The Data & The "Math" Epiphany**

**The User Goal:** You provided a highly professional JSON format that defined the physical properties and structural topology of the K'NEX pieces.  
**Original Declarative JSON Example:**

JSON

{  
  "model": {  
    "parts": \[  
      { "instance\_id": "motor-1", "part\_id": "motor-v1", "position": \[0,0,50\], "quaternion": \[0,0,0,1\] },  
      { "instance\_id": "rod-1", "part\_id": "rod-128-red-v1", "position": \[0,0,50\], "quaternion": \[0,-0.707,0,0.707\] }  
    \],  
    "connections": \[  
      { "from": "rod-1.end1", "to": "motor-1.drive\_axle", "joint\_type": "revolute" }  
    \]  
  }  
}

**The AI Solution (The Pivot):** VLMs are terrible at calculating exact 3D math (15-decimal floating-point positions and quaternions) from a 2D sketch. We decided to **split the architecture**:

1. The VLM will strictly output *pure topology* (what connects to what).  
2. Your downstream application code will act as a Forward Kinematics solver to calculate the math and coordinates based on the VLM's topological graph.

### **Phase 3: Declarative vs. Procedural**

**The User Goal:** You asked if a procedural format (step-by-step instructions) would be easier for the AI to learn than the declarative graph.  
**Procedural JSON Example:**

JSON

{  
  "actions": \[  
    { "step": 1, "action": "add\_part", "part\_id": "motor-v1", "instance\_id": "motor-1" },  
    { "step": 2, "action": "add\_part", "part\_id": "rod-red", "instance\_id": "rod-1" },  
    { "step": 3, "action": "snap", "from\_port": "rod-1.end1", "to\_port": "motor-1.drive\_axle" }  
  \]  
}

**The AI Solution:** The declarative format is vastly superior for a static sketch. A single image does not have an inherent chronological build order; asking the AI to hallucinate a sequence creates a high risk of cascading errors. The VLM should output the static state, and if you need an animation/procedural list later, your application can derive it programmatically from the graph.

### ---

**Phase 4: The K'NEX Shorthand Format (The Breakthrough)**

**The User Goal:** You suggested using a lightweight, Graphviz-style text shorthand instead of heavy JSON to make it easier for the AI to generate.  
**The AI Solution:** This was the major breakthrough. We refined your shorthand to ensure it implicitly handled part instantiation and specific connection details without needing an up-front declaration block.  
**The Shorthand Rules:**

* **Semantic Instance IDs:** Combine the part type with an integer (e.g., rc3\_1 for Red 3-way Connector instance 1).  
* **Standardized Ports:** .A, .B, .C for connectors; .end1, .end2, .center for rods.  
* **Joint Types:** \-- for a fixed connection, \~\~ for a revolute (spinning) connection.

**The Shorthand Example (A Rectangle using Grey and White rods):**

Plaintext

rc3\_1.A \-- gr\_1.end1  
gr\_1.end2 \-- rc3\_2.C  
rc3\_2.A \-- wr\_1.end1  
wr\_1.end2 \-- rc3\_3.C  
rc3\_3.A \-- gr\_2.end1  
gr\_2.end2 \-- rc3\_4.C  
rc3\_4.A \-- wr\_2.end1  
wr\_2.end2 \-- rc3\_1.C

### **Phase 5: The Python Parser**

To bridge the AI's shorthand output to your application's 3D solver, we wrote a script that parses the text and reconstructs the structured parts and connections JSON arrays.  
**The Shorthand-to-JSON Parser:**

Python

import json

def parse\_knex\_shorthand(shorthand\_text):  
    parts\_dict \= {}  
    connections \= \[\]  
      
    for line in shorthand\_text.strip().split('\\n'):  
        line \= line.strip()  
        if not line: continue  
              
        if '--' in line:  
            joint\_type \= 'fixed'  
            left\_side, right\_side \= line.split('--')  
        elif '\~\~' in line:  
            joint\_type \= 'revolute'  
            left\_side, right\_side \= line.split('\~\~')  
        else: continue  
              
        left\_side, right\_side \= left\_side.strip(), right\_side.strip()  
          
        def process\_node(node\_str):  
            instance\_id, port \= node\_str.split('.')  
            part\_id \= instance\_id.rsplit('\_', 1)\[0\]   
            if instance\_id not in parts\_dict:  
                parts\_dict\[instance\_id\] \= { "instance\_id": instance\_id, "part\_id": part\_id }  
            return f"{instance\_id}.{port}"  
          
        connections.append({  
            "from": process\_node(left\_side),  
            "to": process\_node(right\_side),  
            "joint\_type": joint\_type  
        })  
          
    return json.dumps({"model": {"parts": list(parts\_dict.values()), "connections": connections}}, indent=2)

### ---

**Phase 6: The MLX Fine-Tuning Pipeline**

With the highly optimized shorthand data format ready, we mapped out the exact terminal commands to train the Qwen2-VL model on your M4 Mac.  
**1\. Environment Setup:**

Bash

mkdir knex-vlm-trainer  
cd knex-vlm-trainer  
python3 \-m venv .venv  
source .venv/bin/activate  
pip install mlx mlx-vlm transformers huggingface\_hub pillow

**2\. Data Requirements (train.jsonl structure):**  
You need roughly 300+ image/shorthand pairs organized in a data/ folder containing an images/ directory and your .jsonl files.

JSON

{"messages": \[{"role": "user", "content": \[{"type": "text", "text": "Extract K'NEX topology..."}, {"type": "image", "image": "data/images/sketch\_001.jpg"}\]}, {"role": "assistant", "content": "rc3\_1.A \-- gr\_1.end1\\ngr\_1.end2 \-- rc3\_2.C\\nrc3\_2.A \-- wr\_1.end1\\nwr\_1.end2 \-- rc3\_3.C\\nrc3\_3.A \-- gr\_2.end1\\ngr\_2.end2 \-- rc3\_4.C\\nrc3\_4.A \-- wr\_2.end1\\nwr\_2.end2 \-- rc3\_1.C"}\]}

**3\. The Training Command:**

Bash

python \-m mlx\_vlm.lora \\  
    \--model "qwen/Qwen2-VL-7B-Instruct" \\  
    \--train \\  
    \--data "data/" \\  
    \--batch-size 2 \\  
    \--lora-layers 8 \\  
    \--iters 600

**4\. Testing the Fine-Tuned Model:**

Bash

python \-m mlx\_vlm.generate \\  
    \--model "qwen/Qwen2-VL-7B-Instruct" \\  
    \--adapter-path "adapters" \\  
    \--image "path/to/brand\_new\_sketch.jpg" \\  
    \--prompt "Extract K'NEX topology..." \\  
    \--max-tokens 500

---

This is a complete, end-to-end blueprint for your project. Would you like me to go ahead and write that Python script to automatically bundle your folders of images and text files into the final train.jsonl format, so you can immediately start generating data without worrying about JSON formatting?