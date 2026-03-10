import type { SynthesisJobStore } from './jobStore'
import type { SynthesisCandidate } from '../../types/synthesis'
import { canonicalizeTopology, TopologyModel } from '../topologySolver'

// Standard hashing mechanism (simple string hash or SHA-256 for browser)
async function hashString(str: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(str)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  return hashHex
}

// Generate a structural fingerprint for a topology model
export async function getTopologyFingerprint(model: TopologyModel): Promise<string> {
  const canonical = canonicalizeTopology(model)
  
  // Create a minimal stable string representation of just parts and connections
  const representation = JSON.stringify({
    parts: canonical.parts.map(p => p.part_id).sort(),
    connections: canonical.connections.map(c => ({
      from: c.from,
      to: c.to,
      type: c.joint_type,
      twist: c.twist_deg,
      slide: c.slide_offset
    }))
  })

  return await hashString(representation)
}

export class CandidateRepository {
  constructor(private jobStore: SynthesisJobStore) {}

  /**
   * Scans a list of candidates and filters out ones whose topologies are functionally identical 
   * to those already seen in the provided set or previously saved jobs.
   */
  public async deduplicate(newCandidates: SynthesisCandidate[], existingHashes: Set<string> = new Set()): Promise<SynthesisCandidate[]> {
    const uniqueCandidates: SynthesisCandidate[] = []
    
    for (const candidate of newCandidates) {
      const fingerprint = await getTopologyFingerprint(candidate.topology)
      if (!existingHashes.has(fingerprint)) {
        existingHashes.add(fingerprint)
        uniqueCandidates.push(candidate)
      }
    }

    return uniqueCandidates
  }

  /**
   * Retrieves all candidates across all saved jobs
   */
  public async getAllCandidates(): Promise<SynthesisCandidate[]> {
    const jobs = await this.jobStore.list()
    return jobs.flatMap(job => job.candidates)
  }
}
