# K'NEX Sketch Standardization Guide

**Goal:** Create a consistent visual vocabulary that a Vision-Language Model (VLM) can instantly translate into topological shorthand.

### 1. The Canvas & Medium

* **Medium:** Digital sketching (iPad/Apple Pencil, Excalidraw, or a drawing tablet) is highly recommended over pen and paper. It allows you to copy/paste connectors, ensuring perfect consistency, and avoids lighting/shadow issues in photographs.
* **Background:** Pure white.
* **Ink:** Black lines. (You *can* use colored lines for rods to match K'NEX colors, but using black lines with text labels is actually safer because it forces the AI to read your specific part IDs rather than guessing based on slightly different hex codes of red).

### 2. The Visual Dictionary: Drawing Parts

You are not drawing 3D blueprints; you are drawing **topological wireframes**.

**Rods (Edges)**

* **Visual:** Draw a simple, straight line.
* **Labeling:** Write the specific instance ID clearly next to the center of the line (e.g., `gr_1` for grey rod 1, `wr_2` for white rod 2).
* **Ports:** You do not need to explicitly write `end1` or `end2` on the drawing. The AI will infer this based on what the ends of the line touch.

**Connectors (Nodes)**

* **Visual:** Draw a circle (the hub) with short protruding lines (the slots) indicating exactly how many connection points it has.
* *3-way:* Circle with a "Y" or "T" shape of spokes.
* *5-way:* Circle with half-moon spokes.
* *8-way:* Circle with full compass spokes.


* **Labeling:** Write the instance ID inside or immediately next to the circle (e.g., `rc3_1` for red 3-way, `yc5_2` for yellow 5-way).

### 3. The "Clock Face" Rule: Labeling Ports

This is the most critical rule. Connectors have specific slots. The AI must know which slot is being used to build accurate geometry later.

* **The Rule:** Always label your active connector ports with tiny, explicit letters (`A`, `B`, `C`, etc.).
* **The Standard:** Treat the connector like a clock. The top-most slot (12 o'clock) is always **A**. Proceed clockwise for **B**, **C**, **D**, etc.
* *Note:* Even if a 3-way connector only uses slots at 12, 3, and 6 o'clock, label them A, B, and C respectively on your drawing.

### 4. Drawing Connections (Joints)

How a rod meets a connector dictates the physics (fixed vs. spinning).

* **Fixed Joint (`--`):** The rod line connects directly to the tip of a connector's spoke.
* **Revolute / Slip Joint (`~~`):** The rod line passes completely *through* the center of the connector's circle. To make this foolproof for the AI, draw a small curved arrow `↺` hovering right next to the center of the hub.

---

### 5. The 3-Step Workflow for Dataset Generation

When you sit down to create a batch of training data, follow this exact loop:

**Step 1: Draw the Topology**

1. Draw your connectors (circles with spokes).
2. Draw your rods (lines connecting the spokes).
3. Add all labels: Instance IDs (`gr_1`, `rc3_1`), and Port Letters (`A`, `B`, `C`) at the connection points.

**Step 2: Save the Image**

* Export the sketch as `sketch_001.jpg` and place it in your `raw_data/` folder. Keep the resolution around 1024x1024 to save RAM during training.

**Step 3: Write the Target Shorthand**

* Create a text file named `sketch_001.txt` in the same folder.
* Trace your drawing with your eyes, writing down the shorthand line-by-line exactly as the drawing dictates.

**Example Match:**
If your drawing shows the `end1` of `wr_1` touching the `A` port of `yc5_1`, your text file must have the line:
`yc5_1.A -- wr_1.end1`

---

### Pro-Tip for Scaling

Once you have drawn ~50 examples with explicit `A`, `B`, `C` labels on every single port, the model will likely learn the "clockwise" rule implicitly. For your next 100 drawings, you might find you can stop drawing the tiny letters and the AI will still correctly output `.A` or `.B` in the text just by looking at the angle of the line! But start strict.

Would you like to brainstorm a list of the first 10 "Hello World" shapes you should draw (e.g., Single Rod, Triangle, Square, Hinge) to ensure the model builds a foundational understanding of your syntax before tackling complex motorized assemblies?
