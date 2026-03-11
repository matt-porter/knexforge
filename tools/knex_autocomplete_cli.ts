import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { TopologyAutocompleteService } from '../frontend/src/services/synthesis/autocomplete.js';
import { parseCompactTopology, stringifyCompactTopology } from '../frontend/src/services/topologyCompactFormat.js';
import type { KnexPartDef } from '../frontend/src/types/parts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function loadPartDefs() {
  const partsDir = path.join(__dirname, '../parts');
  const defs = new Map<string, KnexPartDef>();
  
  const files = fs.readdirSync(partsDir).filter(f => f.endsWith('.json'));
  for (const file of files) {
    const content = fs.readFileSync(path.join(partsDir, file), 'utf-8');
    const def = JSON.parse(content) as KnexPartDef;
    defs.set(def.id, def);
  }
  return defs;
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0]; // 'suggest' or 'solve'
  const inputFile = args[1];

  if (!command || !inputFile) {
    console.error('Usage: node tools/knex_autocomplete_cli.js <command> <inputFile>');
    console.error('Commands: suggest, solve');
    process.exit(1);
  }

  const defs = await loadPartDefs();
  const service = new TopologyAutocompleteService(defs);

  const inputContent = fs.readFileSync(inputFile, 'utf-8');
  let model;
  try {
    if (inputContent.trim().startsWith('{')) {
      model = JSON.parse(inputContent);
    } else {
      model = parseCompactTopology(inputContent);
    }
  } catch (err) {
    console.error('Failed to parse input topology:', err.message);
    process.exit(1);
  }

  if (command === 'suggest') {
    const response = service.getSuggestions(model);
    console.log(JSON.stringify({
      current_model_shorthand: stringifyCompactTopology(model),
      suggestions: response.suggestions.map(s => ({
        shorthand_line: s.shorthand_line,
        part_id: s.part_id,
        instance_id: s.instance_id,
        from_port: s.from_port,
        to_port: s.to_port
      }))
    }, null, 2));
  } else if (command === 'solve') {
    const response = service.getSuggestions(model);
    console.log(JSON.stringify(response.current_solved_build, null, 2));
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
