/**
 * Feature Flags Configuration
 * Used for staged rollouts, beta features, and local development toggles.
 */

export interface FeatureFlags {
  /**
   * Enables the Phase 15 AI Synthesis UI and Web Worker pipeline.
   * Rollout: Beta users only.
   */
  enableAiSynthesis: boolean

  /**
   * Enables the experimental slide-offset editing in the UI.
   * Rollout: Full.
   */
  enableSlideOffset: boolean
}

// Default states
const defaultFlags: FeatureFlags = {
  enableAiSynthesis: false,
  enableSlideOffset: true,
}

class FeatureFlagService {
  private flags: FeatureFlags

  constructor() {
    this.flags = { ...defaultFlags }
    this.initFromEnvironment()
  }

  private initFromEnvironment() {
    // In Vite, env vars are exposed on import.meta.env
    // We parse VITE_FF_ENABLE_AI_SYNTHESIS
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') {
      // Vitest environment defaults
      return
    }

    try {
      const synEnv = import.meta.env?.VITE_FF_ENABLE_AI_SYNTHESIS
      if (synEnv !== undefined) {
        this.flags.enableAiSynthesis = synEnv === 'true'
      }
    } catch (e) {
      // Ignore if not in a Vite browser environment
    }
  }

  public get(flag: keyof FeatureFlags): boolean {
    return this.flags[flag]
  }

  public set(flag: keyof FeatureFlags, value: boolean) {
    this.flags[flag] = value
  }

  public getAll(): FeatureFlags {
    return { ...this.flags }
  }
}

export const featureFlags = new FeatureFlagService()
