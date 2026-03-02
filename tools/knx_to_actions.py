import json
import sys
import argparse

def main():
    parser = argparse.ArgumentParser(description="Convert a .knx file to an action sequence format.")
    parser.add_argument("input_knx", help="Path to the input .knx file")
    parser.add_argument("--output", "-o", help="Path to the output JSON file", default="actions_output.json")
    
    args = parser.parse_args()

    try:
        with open(args.input_knx, 'r') as f:
            knx = json.load(f)
    except Exception as e:
        print(f"Error loading {args.input_knx}: {e}")
        sys.exit(1)

    parts = knx.get('model', {}).get('parts', [])
    conns = knx.get('model', {}).get('connections', [])

    actions = []
    step = 1

    added_instances = set()
    added_conns = set()

    for part in parts:
        actions.append({
            'step': step,
            'action': 'add_part',
            'part_id': part['part_id'],
            'instance_id': part['instance_id'],
            'position': part['position'],
            'quaternion': part['quaternion'],
            'color': part.get('color')
        })
        step += 1
        added_instances.add(part['instance_id'])

        for conn in conns:
            from_inst = conn['from'].split('.')[0]
            to_inst = conn['to'].split('.')[0]
            conn_key = f"{conn['from']}-{conn['to']}"
            
            # If both parts involved in the connection have been added and this connection wasn't added yet
            if from_inst in added_instances and to_inst in added_instances and conn_key not in added_conns:
                actions.append({
                    'step': step,
                    'action': 'snap',
                    'from_port': conn['from'],
                    'to_port': conn['to']
                })
                step += 1
                added_conns.add(conn_key)

    try:
        with open(args.output, 'w') as f:
            json.dump(actions, f, indent=2)
        print(f"Successfully extracted {len(actions)} actions to {args.output}")
    except Exception as e:
        print(f"Error saving to {args.output}: {e}")

if __name__ == "__main__":
    main()
