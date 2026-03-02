tools/knx_to_actions.py. 

It takes a .knx file and extracts its parts and connections into an ordered
sequence of add_part and snap actions, saving the result to a JSON file.

You can use it like this from the terminal:

  python tools/knx_to_actions.py exports/motor_example.knx --output output_actions.json