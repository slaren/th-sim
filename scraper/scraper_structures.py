from lxml import etree
from lxml import html
import re
import os
import json
import sys
import pprint

def parse_structure(tree, xmlname, name, structures):
	levels = tree.xpath("/Data/Structures/Structure[@name='" + xmlname + "' and @level>0]")
	nlevel = 0

	structure = {
		"name": name,
		"type": "structure",
		"levels": []
	}

	for level in levels:
		nlevel = level.get("level")
		time =  level.get("time")
		labor = level.get("labor")
		gold =  level.get("gold")
		wood =  level.get("wood")
		crop =  level.get("crop")
		iron =  level.get("iron")

		hp = level.get("hp")
		splash = level.get("splash")
		attack = level.get("attack")
		range = level.get("range")
		position = level.get("stealth")
		speed = level.get("speed")
		
		level_data = {
			"level": int(nlevel),
			"cost": {
				"time": int(time),
				"labor": int(labor),
				"gold": int(gold),
				"wood": int(wood),
				"crop": int(crop),
				"iron": int(iron),
			},
			"hp": int(hp),
			"splash": int(splash),
			"attack": float(attack),
			"range": int(range),
			"position": int(position),
			"speed": int(speed),
		}


		structure["levels"].append(level_data)
	structures[name] = structure

structures = {}
tree = etree.parse("data.xml")
parse_structure(tree, "TOWNCENTER", "Town Center", structures)
parse_structure(tree, "FARM", "Farm", structures)
parse_structure(tree, "LUMBERMILL", "Lumbermill", structures)
parse_structure(tree, "FOUNDRY", "Foundry", structures)
parse_structure(tree, "REFINERY", "Refinery", structures)
parse_structure(tree, "TRAINING_GROUND", "Training Ground", structures)
parse_structure(tree, "BARRACK", "Barrack", structures)
parse_structure(tree, "STABLE", "Stable", structures)
parse_structure(tree, "WORKSHOP", "Workshop", structures)
parse_structure(tree, "UNIVERSITY", "University", structures)
parse_structure(tree, "ARMORY", "Armory", structures)
parse_structure(tree, "BLACKSMITH", "Blacksmith", structures)
parse_structure(tree, "TOWER", "Tower", structures)
parse_structure(tree, "CANNON_TOWER", "Cannon Tower", structures)
parse_structure(tree, "TRADING_POST", "Trading Post", structures)
parse_structure(tree, "MARKET", "Market", structures)
parse_structure(tree, "TRIBAL_GATHERING", "Tribal Gathering", structures)
parse_structure(tree, "TRIBAL_FAIR", "Tribal Fair", structures)
parse_structure(tree, "TRIBAL_CARNIVAL", "Tribal Carnival", structures)
parse_structure(tree, "TRIBAL_FESTIVAL", "Tribal Festival", structures)
parse_structure(tree, "GRAPE_FIELD", "Vineyard", structures)
parse_structure(tree, "STRONGHOLD_GATE", "Stronghold Gate", structures)

print(json.dumps(structures, sort_keys=True, indent=4))