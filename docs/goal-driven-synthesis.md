# Goal-Driven Mechanism Synthesis

## Overview
The Goal-Driven Mechanism Synthesizer (Phase 15) allows users to specify functional intent (e.g., "stable motorized spinner under 35 parts") and automatically generates ranked, editable mechanism candidates that are topology-valid and physically plausible.

## Architecture
- **Browser-First (TypeScript)**: The synthesis engine runs entirely in the browser to align with static hosting requirements. No persistent Python API is required.
- **Worker Execution**: Heavy lifting (generation, canonicalization, loop-solving) operates in an async `Web Worker` to keep the React UI thread responsive.
- **Store Orchestration**: `useSynthesisStore` (Zustand) acts as the bridge between the UI (`SynthesisPanel`, `CandidateExplorer`) and the worker runtimes.
- **Deterministic Pipeline**: Using a seeded PRNG (`DeterministicRandom`), the same inputs (Template + Constraints + Seed) will always yield the same mechanism.

## Core Modules
1. **Templates (`frontend/src/services/synthesis/templateCatalog`)**: Parameterized base mechanisms (crank slider, spinner, 4-bar loop).
2. **Mutations (`frontend/src/services/synthesis/mutations.ts`)**: Stochastic modifiers (e.g. adjust slide offset, twist joint 90 degrees) to expand the search space.
3. **Topology Oracle (`frontend/src/services/synthesis/topologyOracle.ts`)**: Validates generated graphs. Canonicalizes topologies and runs them through the existing deterministic `solveTopology` engine to ensure closed-loop structures are physically possible.
4. **Physics Ranking (`frontend/src/services/synthesis/scoring.ts`)**: Evaluates geometric properties (Center of mass, Support Polygon, Bounding Box) to generate stability/stress heuristic scores without relying on the heavy Rapier physics sim.

## Operator Runbook
- **Adding new parts**: If adding new parts to `knex-part.json`, ensure they are added to `partFixtures.ts` or fetched dynamically by the oracle context so the synthesizer knows about their connection ports.
- **Telemetry**: User opt-ins generate events in the Supabase `synthesis_feedback` table. If metrics suddenly drop, check network logs or `telemetryEnabled` configuration in `frontend/src/services/synthesisFeedback.ts`.

## Limitations
- Candidates are evaluated using **static geometric heuristics** instead of a full dynamic Rapier sim to maintain performance. 
- Very complex linkage loops may time out if the iteration limits in `topologySolver` are exceeded. We rely on the async worker timeout to gracefully cancel these.