from lxml import etree
from lxml import html
import re
import os
import json
import sys

def get_num(str):
	return int(re.search("^(\d+)", str).group(1))

def get_time(str):
	m = re.search("^(\d+):(\d+):(\d+)", str)
	return 60 * (int(m.group(1)) * 60 + int(m.group(2))) + int(m.group(3))

source_dir = "html_src"

units = {}

for filename in os.listdir(source_dir):
	tree = html.parse(os.path.join(source_dir, filename))

	name = tree.xpath("/html/body/div/div[2]/div[2]/div[2]/div[2]/h2")[0].text
	print >> sys.stderr, name

	levels = tree.xpath("/html/body/div/div[2]/div[2]/div[2]/div[position()>3]")
	nlevel = 0

	unit = {
		"name": name,
		"levels": []
	}
	units[name] = unit
	for level in levels:
		if len(level.xpath("strong"))>0:
			continue

		nlevel = nlevel + 1
		time = level.xpath("div[4]/div/img")[0].tail.strip()
		labor = level.xpath("div[4]/div[2]")[0].text.strip()
		gold = level.xpath("div[4]/div[3]")[0].text.strip()
		wood = level.xpath("div[4]/div[4]")[0].text.strip()
		crop = level.xpath("div[4]/div[5]")[0].text.strip()
		iron = level.xpath("div[4]/div[6]")[0].text.strip()

		hp = level.xpath("div[5]/div[2]")[0].text.strip()
		splash = level.xpath("div[5]/div[4]")[0].text.strip()
		attack = level.xpath("div[6]/div[2]")[0].text.strip()
		carry = level.xpath("div[6]/div[4]")[0].text.strip()
		range = level.xpath("div[7]/div[2]")[0].text.strip()
		position = level.xpath("div[7]/div[4]")[0].text.strip()
		speed = level.xpath("div[8]/div[2]")[0].text.strip()
		upkeep = level.xpath("div[8]/div[4]/img")[0].tail.strip()
		
		level_data = {
			"level": nlevel,
			"cost": {
				"time": get_time(time),
				"labor": int(labor),
				"gold": int(gold),
				"wood": int(wood),
				"crop": int(crop),
				"iron": int(iron),
			},
			"hp": int(hp),
			"splash": get_num(splash),
			"attack": float(attack),
			"carry": int(carry),
			"range": get_num(range),
			"position": get_num(position),
			"speed": int(speed),
			"upkeep": get_num(upkeep)
		}

		unit["levels"].append(level_data)

print(json.dumps(units, sort_keys=True, indent=4))