import json
import argparse
import sys

def parse_knex_shorthand(shorthand_text):
    """
    Converts K'NEX topological shorthand into a structured JSON graph.
    """
    parts_dict = {}
    connections = []
    
    for line_num, line in enumerate(shorthand_text.strip().split('\n'), 1):
        line = line.strip()
        if not line or line.startswith('#'):
            continue
            
        # Determine joint type and split
        if '--' in line:
            joint_type = 'fixed'
            parts = line.split('--')
        elif '~~' in line:
            joint_type = 'revolute'
            parts = line.split('~~')
        else:
            print(f"Warning (Line {line_num}): Skipping invalid line (no valid joint '--' or '~~' detected) -> {line}", file=sys.stderr)
            continue
            
        if len(parts) != 2:
            print(f"Warning (Line {line_num}): Malformed connection -> {line}", file=sys.stderr)
            continue
            
        left_side = parts[0].strip()
        right_side = parts[1].strip()
        
        def process_node(node_str):
            try:
                instance_id, port = node_str.split('.')
                # Extract base part_id (e.g., "rc3" from "rc3_1")
                part_id = instance_id.rsplit('_', 1)[0] 
                
                if instance_id not in parts_dict:
                    parts_dict[instance_id] = {
                        "instance_id": instance_id,
                        "part_id": part_id
                    }
                return f"{instance_id}.{port}"
            except ValueError:
                raise ValueError(f"Malformed node format '{node_str}'. Expected 'instance_id.port'")
        
        try:
            from_port = process_node(left_side)
            to_port = process_node(right_side)
            
            connections.append({
                "from": from_port,
                "to": to_port,
                "joint_type": joint_type
            })
        except ValueError as e:
            print(f"Error on line {line_num}: {e}", file=sys.stderr)
            continue
            
    return {
        "model": {
            "parts": list(parts_dict.values()),
            "connections": connections
        }
    }

def main():
    parser = argparse.ArgumentParser(description="Convert K'NEX VLM shorthand to JSON topology.")
    parser.add_argument("input_file", help="Path to the text file containing the AI's shorthand output")
    parser.add_argument("-o", "--output", help="Path to save the generated JSON file", default=None)
    
    args = parser.parse_args()
    
    try:
        with open(args.input_file, 'r', encoding='utf-8') as f:
            shorthand_text = f.read()
    except FileNotFoundError:
        print(f"Error: Could not find input file '{args.input_file}'", file=sys.stderr)
        sys.exit(1)
        
    result_dict = parse_knex_shorthand(shorthand_text)
    json_output = json.dumps(result_dict, indent=2)
    
    if args.output:
        with open(args.output, 'w', encoding='utf-8') as f:
            f.write(json_output)
        print(f"Successfully wrote JSON topology to {args.output}")
    else:
        # If no output file specified, print to terminal
        print(json_output)

if __name__ == "__main__":
    main()