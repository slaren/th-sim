function shuffle_array(array) {
	var i = array.length, j, tempi, tempj;
	if (i == 0) return false;
	while (--i) {
		j = Math.floor(Math.random() * (i + 1));
		tempi = array[i];
		tempj = array[j];
		array[i] = tempj;
		array[j] = tempi;
	}
	return array;
};

function simulator() {
	var sim = this;

	this.unit_db = [];

	var data_files = ["unit_db.json", "unit_db_static.json", "unit_db_structures.json"];
	var ndata = 0;
	function add_db_data(data) {
		for (unit in data) {
			if (!sim.unit_db[unit])
				sim.unit_db[unit] = {};

			for (field in data[unit]) {
				sim.unit_db[unit][field] = data[unit][field]
			}
		}

		++ndata;

		if (ndata == data_files.length) {
			// merge structures data
			for (u in sim.unit_db) {
				var unit = sim.unit_db[u];
				if (unit.type == "structure") {
					for (field in sim.unit_db["Structures"]) {
						if (!unit[field])
							unit[field] = sim.unit_db["Structures"][field];
					}
				}
			}

			if (sim.ready_fn) {
				sim.ready_fn();
			}
			sim.is_ready = true;
		}
	}

	function db_load_error() {
		alert("Error loading static data file. Refresh the page to try again.");
	}

	function load_db_file(url) {
		$.getJSON(url).success(add_db_data).error(db_load_error);
	}

	for (var i in data_files) {
		load_db_file(data_files[i]);
	}

};

simulator.prototype = {
	// public
	ready: function(ready_fn) {
		if (this.is_ready && ready_fn)
			ready_fn();
		this.ready_fn = ready_fn;
	},

	set_attacker: function(attacker) {
		var r = this.make_stacks(attacker);
		this.attacker_stacks = r[0];
		this.shuffled_attacker_stacks = r[1];
	},

	set_defender: function(defender) {
		var r = this.make_stacks(defender);
		this.defender_stacks = r[0];
		this.shuffled_defender_stacks = r[1];
	},

	reset_combat_time: function() {
		this.combat_time = 0;
		this.attack_interval = this.get_attack_interval();

	},

	get_attacker_stacks: function () {
		return this.attacker_stacks;
	},

	get_defender_stacks: function () {
		return this.defender_stacks;
	},

	set_combat_callbacks: function(damage, stack_death) {
		this.damage_fn = damage;
		this.stack_death_fn = stack_death;
	},

	get_army_losses: function(army) {
		var losses = [];
		// sum and join stacks
		for (var i in army) {
			var stack = army[i];
			if (stack.count < stack.count_max) {
				if (!losses[stack.unit])
					losses[stack.unit] = [];
				if (!losses[stack.unit][stack.level])
					losses[stack.unit][stack.level] = 0;
				losses[stack.unit][stack.level] += stack.count_max - stack.count;
			}
		}
		// convert to army format
		var losses_army = [];
		for (var unit in losses) {
			for (var level in losses[unit]) {
				var stack = {
					"unit": unit,
					"level": level,
					"count": losses[unit][level]
				};
				losses_army.push(stack);
			}
		}
		// sort
		this.sort_army(losses_army);

		return losses_army;
	},

	get_army_cost: function(army) {
		var crop = 0, gold = 0, iron = 0, labor = 0, time = 0, wood = 0;
		var upkeep = 0;

		for (var i in army) {
			var stack = army[i];
			var unit_lv = this.get_unit_info(stack.unit).levels[stack.level - 1];
			crop += unit_lv.cost.crop * stack.count;
			gold += unit_lv.cost.gold * stack.count;
			iron += unit_lv.cost.iron * stack.count;
			labor+= unit_lv.cost.labor * stack.count;
			time += unit_lv.cost.time * stack.count;
			wood += unit_lv.cost.wood * stack.count;
			upkeep += (unit_lv.upkeep || 0) * stack.count;
		}

		return {
			"crop": crop,
			"gold": gold,
			"iron": iron,
			"labor": labor,
			"time": time,
			"wood": wood,
			"upkeep": upkeep
		};
	},

	get_army_upkeep: function(army) {
		var upkeep = 0;

		for (var i in army) {
			var unit = army[i];
			var unit_lv = this.get_unit_info(unit.unit).levels[unit.level - 1];
			upkeep += (unit_lv.upkeep || 0) * unit.count;
		}

		return upkeep;
	},

	get_attack_interval: function() {
		var stack_count = this.count_active_stacks(this.attacker_stacks) + this.count_active_stacks(this.defender_stacks);
		var adjusted_time = 20 * 100 / (100 + Math.min(400, stack_count));
		return Math.max(4, adjusted_time);
	},

	get_miss_chance: function(is_attacker) {
		if (is_attacker)
			return this.get_army_miss_chance(this.attacker_stacks, this.defender_stacks);
		else
			return this.get_army_miss_chance(this.defender_stacks, this.attacker_stacks);
	},

	get_army_miss_chance: function(attacker, defender) {
		var attacker_upkeep = this.get_army_upkeep(attacker);
		var defender_upkeep = this.get_army_upkeep(defender);
		var delta = Math.max(0, attacker_upkeep / defender_upkeep);
		var effectiveness = attacker_upkeep > 200 ?  1 : defender_upkeep / 200;
		var miss;

		if (delta < 1)
			miss = 0;
		else if (delta < 1.25)
			miss = 10;
		else if (delta < 1.5)
			miss = 17;
		else if (delta < 2)
			miss = 22;
		else if (delta < 3.5)
			miss = 30;
		else if (delta < 5)
			miss = 40;
		else if (delta < 7)
			miss = 48;
		else if (delta < 10)
			miss = 55;
		else
			miss = 60;

		return (miss * effectiveness).toFixed(0) / 100.0;
	},

	get_combat_time: function() {
		return this.combat_time;
	},

	do_round: function() {
		var attack_interval = this.attack_interval;

		// alternating ordered attack order
		var ia = 0, id = 0;
		function get_next_valid_stack(stacks, pos) {
			if (pos === null)
				return null;

			for (; pos < stacks.length; ++pos) {
				if (stacks[pos].count > 0) {
					return pos;
				}
			}
			return null;
		}

		while (ia != null || id != null) {
			// defender attack
			id = get_next_valid_stack(this.defender_stacks, id);
			if (id !== null) {
				if (this.combat_time != 0)
					this.combat_time += attack_interval;
				this.do_attack(this.defender_stacks[id], this.shuffled_attacker_stacks, false);
				++id;
			}
			// attacker attack
			ia = get_next_valid_stack(this.attacker_stacks, ia);
			if (ia !== null) {
				this.combat_time += attack_interval;
				this.do_attack(this.attacker_stacks[ia], this.shuffled_defender_stacks, true);
				++ia;
			}
		}
	},

	get_unit_info: function(unit) {
		var unit_info = this.unit_db[unit];
		return unit_info;
	},

	get_damage_mod: function(a_unit, d_unit) {
		var ai = this.get_unit_info(a_unit);
		var di = this.get_unit_info(d_unit);

		if (!ai.damage_mod[d_unit] && di.type == "structure")
			return ai.damage_mod["Structures"];
		else
			return ai.damage_mod[d_unit];
	},

	get_stack_targets: function(a_stack, target_stacks) {
		var a_unit = this.get_unit_info(a_stack.unit);
		var a_unit_lv = a_unit.levels[a_stack.level - 1];
		var splash = a_unit.levels[a_stack.level - 1].splash;
		var targets = [];
		var mt_stack, mt_unit, mt_unit_lv

		// find a main target
		for (var i = 0; i < target_stacks.length; ++i) {
			var d_stack = target_stacks[i];
			var d_unit = this.unit_db[d_stack.unit];
			var d_unit_lv = d_unit.levels[d_stack.level - 1];
			
			if (d_stack.count == 0)
				continue;

			if (
				!mt_stack ||
				// choose by range
				(a_unit_lv.range < mt_unit_lv.position && a_unit_lv.range >= d_unit_lv.position) ||
				// choose by damage modifier
				((a_unit_lv.range >= d_unit_lv.position || d_unit_lv.position <= mt_unit_lv.position) &&
				(this.get_damage_mod(a_stack.unit, d_stack.unit) > this.get_damage_mod(a_stack.unit, mt_stack.unit)))) {

				mt_stack = d_stack;
				mt_unit = d_unit;
				mt_unit_lv = d_unit_lv;
			}
		}

		if (mt_stack) {
			targets[0] = mt_stack;
			// find splash targets
			for (var nt = 1; nt < splash; ++nt) {
				var t_stack, t_unit, t_unit_lv;
				t_stack = t_unit = t_unit_lv = null;

				for (var i = 0; i < target_stacks.length; ++i) {
					var d_stack = target_stacks[i];
					var d_unit = this.get_unit_info(d_stack.unit);
					var d_unit_lv = d_unit.levels[d_stack.level - 1];

					if (d_stack.count == 0 || targets.indexOf(d_stack) != -1)
						continue;

					if (a_unit_lv.range >= d_unit_lv.position || mt_unit_lv.position >= d_unit_lv.position) {
						if (
							!t_stack ||
							// choose by range
							(a_unit_lv.range < t_unit_lv.position && a_unit_lv.range >= d_unit_lv.position) ||
							// choose by damage modifier
							((a_unit_lv.range >= d_unit_lv.position || d_unit_lv.position <= t_unit_lv.position) &&
							(this.get_damage_mod(a_stack.unit, d_stack.unit) > this.get_damage_mod(a_stack.unit, t_stack.unit)))) {
							t_stack = d_stack;
							t_unit = d_unit;
							t_unit_lv = d_unit_lv
						}
					}
				}

				if (!t_stack)
					break;

				targets[nt] = t_stack;
			}
		}

		return targets;
	},
		
	do_attack: function(a_stack, target_stacks, is_attacker) {
		var a_unit = this.get_unit_info(a_stack.unit);
		var a_unit_lv = a_unit.levels[a_stack.level - 1];

		if (a_unit_lv.attack == 0)
			return;
		
		var t_stacks = this.get_stack_targets(a_stack, target_stacks);

		if (!t_stacks.length)
			// no more targets left, battle is over
			return;

		// got target, do damage
		var miss_chance = this.get_miss_chance(is_attacker);

		for (var i = 0; i < t_stacks.length; ++i) {
			var t_stack = t_stacks[i];
			var t_unit = this.get_unit_info(t_stack.unit);
			var t_unit_lv = t_unit.levels[t_stack.level - 1];
			var is_miss = Math.random() < miss_chance;
			var dmod = this.get_damage_mod(a_stack.unit, t_stack.unit);
			var damage = a_stack.count * a_unit_lv.attack * dmod;
			if (is_miss) {
				damage *= 0.5;
			}

			damage = Math.min(t_stack.hp, damage);

			if (this.damage_fn) {
				this.damage_fn(a_stack, t_stack, damage, is_attacker);
			}

			a_stack.damage_dealt += damage;

			t_stack.hp = Math.max(0, t_stack.hp - damage);
			t_stack.count = Math.ceil(t_stack.hp / t_unit_lv.hp);

			if (t_stack.count == 0 && this.stack_death_fn) {
				this.stack_death_fn(t_stack, !is_attacker);
			}
		}

		if (this.damage_fn) {
			this.damage_fn(a_stack, null, null, is_attacker);
		}
	},

	is_in_combat: function() {
		var a_stacks_active = this.count_active_stacks(this.attacker_stacks);
		var d_stacks_active = this.count_active_stacks(this.defender_stacks);

		return a_stacks_active > 0 && d_stacks_active > 0;
	},

	sort_army: function(army) {
		var sim = this;
		army.sort(function(a, b) {
			return sim.get_unit_info(a.unit).attack_order - sim.get_unit_info(b.unit).attack_order;
		});
	},

	// private
	make_stacks: function(units) {
		// sort units by their attack order first
		this.sort_army(units);

		var stacks = [];
		for (var i = 0; i < units.length; ++i) {
			var unit = units[i];
			var stack_size = this.get_unit_info(unit.unit).stack_size[unit.level - 1];
			var count_left = unit.count;
			while (count_left > 0) {
				var count = (count_left > stack_size) ? stack_size : count_left;
				var hp_max = this.get_unit_info(unit.unit).levels[unit.level - 1].hp * count
				var stack = {
					unit: unit.unit,
					level: unit.level,
					count_max: count,
					count: count,
					hp_max: hp_max,
					hp: hp_max,
					damage_dealt: 0,
				};
				stacks.push(stack);
				count_left = count_left - count;
			}
		}

		// make a shuffled copy for target selection
		var shuffled = shuffle_array(stacks.slice())
		return [ stacks, shuffled ];
	},

	reset_stacks_hp: function(stacks) {
		for (var i = 0; i < stacks.length; ++i) {
			var stack = stacks[i];
			stack.hp = stack.hp_max;
		}
	},

	count_active_stacks: function(stacks) {
		var count  = 0;
		for (var i = 0; i < stacks.length; ++i) {
			var stack = stacks[i];
			if (stack.count > 0)
				count = count + 1;
		}
		return count;
	}
};
