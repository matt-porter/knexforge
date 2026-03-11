import type { SynthesisJobStore } from './jobStore'
import type { SynthesisCandidate } from '../../types/synthesis'
import { canonicalizeTopology, type TopologyModel } from '../topologySolver'

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
  // 1D Weisfeiler-Lehman style structural hashing to canonicalize instance IDs
  let signatures = new Map<string, string>()
  for (const p of model.parts) signatures.set(p.instance_id, p.part_id)

  for (let i = 0; i < 3; i++) {
    const nextSignatures = new Map<string, string>()
    for (const p of model.parts) {
      const conns = model.connections.filter(c => c.from.startsWith(p.instance_id + '.') || c.to.startsWith(p.instance_id + '.'))
      const connSigs = conns.map(c => {
        const isFrom = c.from.startsWith(p.instance_id + '.')
        const myPort = isFrom ? c.from.split('.')[1] : c.to.split('.')[1]
        const otherRef = isFrom ? c.to : c.from
        const otherId = otherRef.split('.')[0]
        const otherPort = otherRef.split('.')[1]
        return `${myPort}:${c.joint_type}:${signatures.get(otherId)}:${otherPort}`
      }).sort().join('|')
      nextSignatures.set(p.instance_id, `${p.part_id}-[${connSigs}]`)
    }
    signatures = nextSignatures
  }

  // Assign deterministic IDs based on final signatures
  // For identical signatures (symmetries), the relative order doesn't matter structurally 
  // as long as we group them together. But to be fully stable we sort them.
  const sortedParts = [...model.parts].sort((a, b) => {
    const sigA = signatures.get(a.instance_id)!
    const sigB = signatures.get(b.instance_id)!
    return sigA.localeCompare(sigB)
  })

  const idMap = new Map<string, string>()
  sortedParts.forEach((p, index) => idMap.set(p.instance_id, `n${index}`))

  const remappedModel: TopologyModel = {
    ...model,
    parts: model.parts.map(p => ({ ...p, instance_id: idMap.get(p.instance_id)! })),
    connections: model.connections.map(c => {
      const f = c.from.split('.')
      const t = c.to.split('.')
      return {
        ...c,
        from: `${idMap.get(f[0])}.${f[1]}`,
        to: `${idMap.get(t[0])}.${t[1]}`
      }
    })
  }

  const canonical = canonicalizeTopology(remappedModel)
  
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
  private jobStore: SynthesisJobStore

  constructor(jobStore: SynthesisJobStore) {
    this.jobStore = jobStore
  }

  /**
   * Scans a list of candidates and filters out ones whose topologies are functionally identical 
   * to those already seen in the provided set or previously saved jobs.
   */
  public async deduplicate(newCandidates: SynthesisCandidate[], existingHashes: Set<string> = new Set()): Promise<SynthesisCandidate[]> {
    const uniqueCandidates: SynthesisCandidate[] = []
    
    // Populate hashes from previously saved jobs for cross-run deduplication
    const allExisting = await this.getAllCandidates()
    for (const cand of allExisting) {
      existingHashes.add(await getTopologyFingerprint(cand.topology))
    }

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
