import { supabase } from './supabaseClient'
import type { SynthesisGoal, SynthesisCandidate } from '../types/synthesis'
import { getTopologyFingerprint } from './synthesis/repository'

export type FeedbackAction = 'accepted' | 'rejected' | 'edited_after_accept'

export interface SynthesisFeedbackEvent {
  job_id: string
  candidate_id: string
  topology_hash: string
  action: FeedbackAction
  goal_prompt: string
  score_total: number
  metadata?: Record<string, unknown>
}

class SynthesisFeedbackService {
  private telemetryEnabled = true

  /**
   * Users can opt-out of sharing synthesis outcomes.
   */
  public setTelemetryEnabled(enabled: boolean) {
    this.telemetryEnabled = enabled
  }

  public getTelemetryEnabled(): boolean {
    return this.telemetryEnabled
  }

  /**
   * Logs a user interaction with a synthesis candidate to Supabase.
   */
  public async logAction(
    jobId: string,
    candidate: SynthesisCandidate,
    goal: SynthesisGoal,
    action: FeedbackAction,
    metadata?: Record<string, unknown>
  ): Promise<boolean> {
    if (!this.telemetryEnabled) {
      return true // Opt-out means silently succeed
    }

    try {
      const hash = await getTopologyFingerprint(candidate.topology)

      const payload: SynthesisFeedbackEvent = {
        job_id: jobId,
        candidate_id: candidate.candidate_id,
        topology_hash: hash,
        action,
        goal_prompt: goal.prompt,
        score_total: candidate.score.total,
        metadata
      }

      // We use RPC or direct insert. Assuming a simple insert into a table named `synthesis_feedback`.
      // The table needs to be created in Supabase with RLS allowing inserts from authenticated or anon users.
      const { error } = await supabase
        .from('synthesis_feedback')
        .insert(payload)

      if (error) {
        console.error('[SynthesisFeedback] Failed to log telemetry:', error)
        return false
      }

      return true
    } catch (err) {
      console.error('[SynthesisFeedback] Exception logging telemetry:', err)
      return false
    }
  }
}

export const synthesisFeedback = new SynthesisFeedbackService()
