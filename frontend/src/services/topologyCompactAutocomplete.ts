import type { KnexPartDef } from '../types/parts'
import { tryInferPartFromInstance } from './topologyCompactFormat'

export interface CompactAutocompleteSuggestion {
  label: string
  insertText: string
  detail?: string
}

export interface CompactAutocompleteResult {
  replaceStart: number
  replaceEnd: number
  suggestions: CompactAutocompleteSuggestion[]
}

function lineBounds(text: string, cursorIndex: number): { start: number; end: number } {
  const start = text.lastIndexOf('\n', Math.max(0, cursorIndex - 1)) + 1
  const nextBreak = text.indexOf('\n', cursorIndex)
  const end = nextBreak >= 0 ? nextBreak : text.length
  return { start, end }
}

function parseKnownInstances(text: string): Map<string, string | null> {
  const instances = new Map<string, string | null>()

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split('#')[0].trim()
    if (!line) continue

    const partMatch = line.match(/^part\s+([A-Za-z0-9_-]+)\s+([A-Za-z0-9._-]+)$/i)
    if (partMatch) {
      const [, instanceId, partId] = partMatch
      instances.set(instanceId, partId)
      continue
    }

    const aliasPartMatch = line.match(/^([A-Za-z0-9_-]+)\s*:\s*([A-Za-z0-9._-]+)$/)
    if (aliasPartMatch) {
      const [, instanceId, partId] = aliasPartMatch
      instances.set(instanceId, partId)
      continue
    }

    const edgeMatch = line.match(/^([A-Za-z0-9_.-]+)\s*(--|~~|=>)\s*([A-Za-z0-9_.-]+)$/)
    if (!edgeMatch) continue

    const [, fromRef, , toRef] = edgeMatch
    const fromInstance = fromRef.split('.')[0]
    const toInstance = toRef.split('.')[0]

    if (!instances.has(fromInstance)) {
      instances.set(fromInstance, tryInferPartFromInstance(fromInstance))
    }
    if (!instances.has(toInstance)) {
      instances.set(toInstance, tryInferPartFromInstance(toInstance))
    }
  }

  return instances
}

function sortedUnique(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b))
}

export function getCompactAutocomplete(
  text: string,
  cursorIndex: number,
  partDefsById: Map<string, KnexPartDef>,
): CompactAutocompleteResult | null {
  const { start: lineStart } = lineBounds(text, cursorIndex)
  const linePrefix = text.slice(lineStart, cursorIndex)

  const tokenStartInLine = Math.max(
    linePrefix.lastIndexOf(' ') + 1,
    linePrefix.lastIndexOf('\t') + 1,
  )
  const tokenStart = lineStart + tokenStartInLine
  const token = text.slice(tokenStart, cursorIndex)
  const trimmedPrefix = linePrefix.trimStart()
  const knownInstances = parseKnownInstances(text)

  const suggestions: CompactAutocompleteSuggestion[] = []

  const partLineMatch = trimmedPrefix.match(/^part\s+([A-Za-z0-9_-]*)\s*([A-Za-z0-9._-]*)$/i)
  if (partLineMatch) {
    const [, instanceToken, partToken] = partLineMatch
    if (trimmedPrefix.includes(' ') && instanceToken && !trimmedPrefix.endsWith(instanceToken)) {
      // typing part_id
      const filtered = [...partDefsById.keys()]
        .filter((partId) => partId.startsWith(partToken))
        .slice(0, 12)
      for (const partId of filtered) {
        suggestions.push({ label: partId, insertText: partId, detail: 'part_id' })
      }
    }
    if (suggestions.length > 0) {
      return { replaceStart: tokenStart, replaceEnd: cursorIndex, suggestions }
    }
  }

  if (token.includes('.')) {
    const dotIdx = token.indexOf('.')
    const instancePrefix = token.slice(0, dotIdx)
    const portPrefix = token.slice(dotIdx + 1)

    const exactPartId = knownInstances.get(instancePrefix) ?? tryInferPartFromInstance(instancePrefix)
    if (exactPartId) {
      const def = partDefsById.get(exactPartId)
      if (def) {
        const matchingPorts = def.ports
          .map((port) => port.id)
          .filter((portId) => portId.startsWith(portPrefix))
          .slice(0, 12)
        for (const portId of matchingPorts) {
          suggestions.push({
            label: `${instancePrefix}.${portId}`,
            insertText: `${instancePrefix}.${portId}`,
            detail: def.name,
          })
        }
      }
    } else {
      const matchingInstances = [...knownInstances.keys()]
        .filter((id) => id.startsWith(instancePrefix))
        .slice(0, 12)
      for (const instanceId of matchingInstances) {
        suggestions.push({
          label: `${instanceId}.`,
          insertText: `${instanceId}.`,
          detail: 'instance',
        })
      }
    }

    if (suggestions.length > 0) {
      return { replaceStart: tokenStart, replaceEnd: cursorIndex, suggestions }
    }
  }

  if (token.startsWith('-') || token.startsWith('~') || token.startsWith('=')) {
    const operators = ['--', '~~', '=>'].filter((op) => op.startsWith(token))
    for (const op of operators) {
      suggestions.push({ label: op, insertText: op, detail: 'joint operator' })
    }
    if (suggestions.length > 0) {
      return { replaceStart: tokenStart, replaceEnd: cursorIndex, suggestions }
    }
  }

  const instanceSuggestions = sortedUnique([...knownInstances.keys()])
    .filter((id) => id.startsWith(token))
    .slice(0, 8)
    .map((id) => ({ label: `${id}.`, insertText: `${id}.`, detail: 'instance' }))

  suggestions.push(...instanceSuggestions)

  if ('part'.startsWith(token)) {
    suggestions.push({ label: 'part', insertText: 'part ', detail: 'declare instance part_id' })
  }

  if ('orient'.startsWith(token)) {
    suggestions.push({ label: 'orient', insertText: 'orient 0 0 0', detail: 'set model world rotation' })
  }

  if (suggestions.length === 0) {
    return null
  }

  return { replaceStart: tokenStart, replaceEnd: cursorIndex, suggestions }
}
