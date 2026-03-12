import type { SynthesisTemplate } from './templates'
import { templateCatalog } from './templateCatalog'
import type { DeterministicRandom } from './mutations'

/**
 * Keyword affinity map: maps keywords/stems to template IDs.
 * When the user's prompt contains one of these keywords, the corresponding
 * template gets a higher selection probability.
 */
const KEYWORD_AFFINITIES: Record<string, string[]> = {
  // Ferris Wheel
  'ferris': ['ferris-wheel-v1'],
  'wheel': ['ferris-wheel-v1', 'vehicle-chassis-v1'],
  'spin': ['ferris-wheel-v1', 'spinner-v1'],
  'round': ['ferris-wheel-v1', 'spinner-v1'],
  'carousel': ['ferris-wheel-v1'],
  'hub': ['ferris-wheel-v1'],
  'spoke': ['ferris-wheel-v1'],

  // Vehicle
  'car': ['vehicle-chassis-v1'],
  'vehicle': ['vehicle-chassis-v1'],
  'truck': ['vehicle-chassis-v1'],
  'race': ['vehicle-chassis-v1'],
  'chassis': ['vehicle-chassis-v1'],
  'drive': ['vehicle-chassis-v1', 'motor-chain-v1'],
  'axle': ['vehicle-chassis-v1'],

  // Tower / Bridge
  'tower': ['tower-bridge-v1'],
  'bridge': ['tower-bridge-v1'],
  'skyscraper': ['tower-bridge-v1'],
  'tall': ['tower-bridge-v1'],
  'frame': ['tower-bridge-v1'],
  'truss': ['tower-bridge-v1'],
  'build': ['tower-bridge-v1', 'crane-v1'],

  // Crane
  'crane': ['crane-v1'],
  'boom': ['crane-v1'],
  'lift': ['crane-v1'],
  'construct': ['crane-v1'],
  'hook': ['crane-v1'],

  // Windmill
  'windmill': ['windmill-v1'],
  'wind': ['windmill-v1'],
  'turbine': ['windmill-v1'],
  'blade': ['windmill-v1'],
  'propeller': ['windmill-v1'],
  'fan': ['windmill-v1'],

  // Spinner (original)
  'spinner': ['spinner-v1'],
  'rotate': ['spinner-v1', 'ferris-wheel-v1'],
  'top': ['spinner-v1'],

  // Crank Slider (original)
  'crank': ['crank-slider-v1'],
  'slider': ['crank-slider-v1'],
  'piston': ['crank-slider-v1'],
  'engine': ['crank-slider-v1'],

  // Linkage Loop (original)
  'linkage': ['linkage-loop-v1'],
  'loop': ['linkage-loop-v1'],
  'mechanism': ['linkage-loop-v1', 'crank-slider-v1'],
  'four-bar': ['linkage-loop-v1'],

  // Motor Chain (original)
  'motor': ['motor-chain-v1'],
  'chain': ['motor-chain-v1'],
  'gear': ['motor-chain-v1'],
}

/**
 * Simple stem function: lowercase, strip trailing s/ed/ing/er/tion.
 * Not a full NLP stemmer — just enough for keyword matching.
 */
function isConsonant(char: string): boolean {
  return /[bcdfghjklmnpqrstvwxyz]/.test(char)
}

function stripTrailingDoubleConsonant(word: string): string {
  if (word.length < 3) {
    return word
  }

  const last = word[word.length - 1]
  const previous = word[word.length - 2]
  if (last !== previous || !isConsonant(last)) {
    return word
  }

  return word.slice(0, -1)
}

function simpleStem(word: string): string {
  let s = word.toLowerCase().replace(/[^a-z0-9-]/g, '')
  if (s.endsWith('tion') && s.length > 6) s = s.slice(0, -4)
  else if (s.endsWith('ing') && s.length > 5) s = stripTrailingDoubleConsonant(s.slice(0, -3))
  else if (s.endsWith('ed') && s.length > 4) s = stripTrailingDoubleConsonant(s.slice(0, -2))
  else if (s.endsWith('er') && s.length > 4) s = s.slice(0, -2)
  // Avoid stripping singular words like "ferris"/"chassis" while still handling simple plurals.
  else if (s.endsWith('s') && !s.endsWith('ss') && !s.endsWith('is') && s.length > 3) s = s.slice(0, -1)

  return s
}

/**
 * Scores each template against the prompt by counting keyword matches.
 * Returns a Map of template ID → affinity score (0 = no match).
 */
export function scoreTemplateAffinity(prompt: string): Map<string, number> {
  const scores = new Map<string, number>()
  const words = prompt
    .split(/[^a-z0-9-]+/i)
    .map(simpleStem)
    .filter((word) => word.length > 0)

  for (const word of words) {
    const matchedIds = KEYWORD_AFFINITIES[word]
    if (matchedIds) {
      for (const templateId of matchedIds) {
        scores.set(templateId, (scores.get(templateId) ?? 0) + 1)
      }
    }
  }

  return scores
}

/**
 * Select a template guided by the user's prompt.
 *
 * - If prompt keywords match templates, sample using affinity-weighted probabilities
 *   (matched templates get proportional weight, unmatched get a small base weight).
 * - If no keywords match, fall back to uniform random selection.
 */
export function selectTemplateByPrompt(
  prompt: string | undefined,
  random: DeterministicRandom,
): SynthesisTemplate {
  const templates = Object.values(templateCatalog)
  if (templates.length === 0) {
    throw new Error('No templates available')
  }

  if (!prompt || prompt.trim().length === 0) {
    return random.pick(templates)
  }

  const affinityScores = scoreTemplateAffinity(prompt)

  // If no keywords matched, fall back to random
  if (affinityScores.size === 0) {
    return random.pick(templates)
  }

  // Build weighted selection
  // Matched templates get weight = score * 10, unmatched get weight = 1
  const BASE_WEIGHT = 1
  const MATCH_MULTIPLIER = 10

  let totalWeight = 0
  const weights: number[] = []

  for (const template of templates) {
    const score = affinityScores.get(template.id) ?? 0
    const weight = score > 0 ? score * MATCH_MULTIPLIER : BASE_WEIGHT
    weights.push(weight)
    totalWeight += weight
  }

  // Weighted random selection
  let roll = random.next() * totalWeight
  for (let i = 0; i < templates.length; i++) {
    roll -= weights[i]
    if (roll <= 0) {
      return templates[i]
    }
  }

  // Fallback (shouldn't reach here)
  return templates[templates.length - 1]
}
