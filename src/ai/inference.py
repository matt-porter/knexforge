"""Autoregressive K'Nex build generation via local LLM (Ollama)."""

import json
import logging
import uuid
from typing import Any

import ollama

from src.core.build import Build
from src.core.parts.models import PartInstance
from src.core.parts.loader import PartLoader
from src.core.physics.graph import compute_stability

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


class InferenceEngine:
    def __init__(self, model_name: str = "llama3.2"):
        self.model_name = model_name
        self.library = PartLoader.load()
        try:
            ollama.show(self.model_name)
        except Exception as e:
            logger.warning(
                f"Could not verify Ollama model '{self.model_name}': {e}. Ensure Ollama is running."
            )

    def generate_build(self, prompt: str, max_steps: int = 20) -> Build:
        """Autoregressively generate a build from a natural language prompt."""
        build = Build()

        system_prompt = (
            "You are an AI generating K'Nex structures. Output a structured JSON stream of actions. "
            "Valid actions are 'add_part' and 'snap'. "
            "If the model is structurally unstable, your actions will be rolled back."
        )

        messages: list[dict[str, str]] = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt},
        ]

        step = 0
        consecutive_failures = 0

        while step < max_steps and consecutive_failures < 3:
            context_msg = f"Current pieces: {len(build.parts)}. "
            if len(build.parts) > 0:
                score = compute_stability(build)
                context_msg += f"Stability score: {score:.1f}/100."

            messages.append(
                {"role": "user", "content": context_msg + " Provide the next JSON action."}
            )

            try:
                response = ollama.chat(
                    model=self.model_name,
                    messages=messages,
                    format="json",
                )

                action_str = response["message"]["content"]
                messages.append({"role": "assistant", "content": action_str})

                action_data = json.loads(action_str)
                logger.info(f"Model proposed action: {action_data.get('action')}")

                success = self._apply_action(build, action_data)

                if success:
                    stability_score = compute_stability(build)
                    if stability_score < 50.0 and len(build.parts) > 1:
                        logger.warning("Unstable build predicted. Rolling back.")
                        build.undo()
                        messages.append(
                            {
                                "role": "system",
                                "content": "Action rejected due to instability. Try a different placement.",
                            }
                        )
                        consecutive_failures += 1
                        continue

                    step += 1
                    consecutive_failures = 0
                else:
                    logger.warning("Invalid action predicted. Rolling back.")
                    messages.append(
                        {"role": "system", "content": "Action was invalid. Provide a valid action."}
                    )
                    consecutive_failures += 1

            except Exception as e:
                logger.error(f"Inference error: {e}")
                consecutive_failures += 1
                messages.append({"role": "system", "content": "Invalid JSON format."})

        logger.info(f"Finished generation in {step} steps.")
        return build

    def _apply_action(self, build: Build, action_data: dict[str, Any]) -> bool:
        """Validate and apply a predicted action."""
        action_type = action_data.get("action")
        try:
            if action_type == "add_part":
                part_id = action_data.get("part_id", "")
                if part_id not in self.library.parts:
                    logger.debug(f"Unknown part_id: {part_id}")
                    return False

                part_def = self.library.parts[part_id]
                pos = tuple(action_data.get("position", [0, 0, 0]))
                rot = tuple(action_data.get("rotation", [0, 0, 0, 1]))

                instance = PartInstance(
                    instance_id=str(uuid.uuid4()),
                    part=part_def,
                    position=pos,  # type: ignore[arg-type]
                    quaternion=rot,  # type: ignore[arg-type]
                )
                build.add_part(instance)
                return True

            elif action_type == "snap":
                conn = build.attempt_snap(
                    from_instance_id=action_data.get("part1_id", ""),
                    from_port_id=action_data.get("port1_id", ""),
                    to_instance_id=action_data.get("part2_id", ""),
                    to_port_id=action_data.get("port2_id", ""),
                )
                return conn is not None

        except Exception as e:
            logger.debug(f"Action application failed: {e}")

        return False


if __name__ == "__main__":
    import sys

    prompt = sys.argv[1] if len(sys.argv) > 1 else "Build a simple K'Nex table."

    engine = InferenceEngine()
    final_build = engine.generate_build(prompt, max_steps=10)
    print(
        f"Generated build with {len(final_build.parts)} parts "
        f"and {len(final_build.connections)} connections."
    )
