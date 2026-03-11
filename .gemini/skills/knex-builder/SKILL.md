---
name: knex-builder
description: Tools for building and validating K'Nex models using a physical oracle and autocomplete engine. Use this skill to suggest valid next steps, solve 3D positions, and build stable mechanisms.
---

# K'Nex Builder Skill

This skill provides access to the K'Nex Synthesis Engine, allowing you to build physically valid models step-by-step.

## Workflows

### 1. Suggesting Next Steps
When you have a partial model and want to know what parts can be legally attached:
1. Save your current model to a `.knx` file.
2. Run `npx tsx tools/knex_autocomplete_cli.ts suggest <model.knx>`.
3. Review the `suggestions` array. Each suggestion provides a `shorthand_line` you can add to your model.

### 2. Solving for 3D Positions
To "see" where the parts are in 3D space:
1. Run `npx tsx tools/knex_autocomplete_cli.ts solve <model.knx>`.
2. This returns a JSON object with every part's `position` ([x,y,z]) and `rotation` (quaternion).

### 3. Iterative Building
You can build a complex model by repeatedly calling `suggest`, picking a valid part, and updating your model file. This ensures every step is physically buildable and won't cause collisions.

## Reference
- **Format Syntax**: See [references/shorthand_format.md](references/shorthand_format.md) for details on the `.knx` format.
- **Oracle Validation**: The engine uses a deterministic solver to check for loop closure and spatial integrity. If `suggest` doesn't show a part, it's likely because that part would cause a physical impossibility.

## Pro Tips for Agents
- If you are using a Vision-Language Model (VLM), you can describe the scene in shorthand, then use `solve` to get the ground-truth coordinates to verify your visual estimation.
- Always prefer the `shorthand_line` provided by the tool to ensure IDs and port names are correct.
