(function() {
//
function sformat(str) {
	var args = arguments;
	return str.replace(/{(\d+)}/g, function(match, number) { 
		return typeof args[number] != 'undefined'
			? args[number]
			: match;
		});
};

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

			if (sim.ready_fn)
					sim.ready_fn();
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
		this.attacker_stacks = r[0]
		this.shuffled_attacker_stacks = r[1]
	},

	set_defender: function(defender) {
		var r = this.make_stacks(defender);
		this.defender_stacks = r[0];
		this.shuffled_defender_stacks = r[1];
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

	get_army_cost: function(army) {
		var crop = 0, gold = 0, iron = 0, labor = 0, time = 0, wood = 0;
		var upkeep = 0;

		for (var i in army) {
			var unit = army[i];
			var unit_lv = this.get_unit_info(unit.unit).levels[unit.level - 1];
			crop += unit_lv.cost.crop * unit.count;
			gold += unit_lv.cost.gold * unit.count;
			iron += unit_lv.cost.iron * unit.count;
			labor+= unit_lv.cost.labor * unit.count;
			time += unit_lv.cost.time * unit.count;
			wood += unit_lv.cost.wood * unit.count;
			upkeep += (unit_lv.upkeep || 0) * unit.count;
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

	do_round: function() {
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
				this.do_attack(this.defender_stacks[id], this.shuffled_attacker_stacks, false);
				++id;
			}
			// attacker attack
			ia = get_next_valid_stack(this.attacker_stacks, ia);
			if (ia !== null) { 
				this.do_attack(this.attacker_stacks[ia], this.shuffled_defender_stacks, true);
				++ia;
			}
		}


		/*
		Attack order:
		1 Fighter
		2 Bowmen
		3 Swordsmen
		4 Archer
		5 Hoplite
		6 Gladiator
		7 Cavalry
		8 Knight
		9 Helepolis
		10 Catapult
		11 Ox Wagon
		*/

		/*
		// random attack order
		shuffle_array(this.attacker_stacks);
		shuffle_array(this.defender_stacks);

		var order = []
		for (var i = 0; i < (this.attacker_stacks.length + this.defender_stacks.length); ++i)
			order[i] = i;
		shuffle_array(order);

		for (var i = 0; i < order.length; ++i) {
			var nstack = order[i];
			if (nstack < this.attacker_stacks.length) {
				var stack = this.attacker_stacks[nstack];
				if (stack.count > 0) {
					this.do_attack(stack, this.defender_stacks, true);
				}
			}
			else {
				var stack = this.defender_stacks[nstack - this.attacker_stacks.length];
				if (stack.count > 0) {
					this.do_attack(stack, this.attacker_stacks, false);
				}
			}
		}
		*/

		/*
		// sequential order of attacks
		for (var i = 0; i < this.attacker_stacks.length; ++i) {
			var stack = this.attacker_stacks[i];
			if (stack.count > 0) {
				this.do_attack(stack, this.defender_stacks, true);
			}
		}
		for (var i = 0; i < this.defender_stacks.length; ++i) {
			var stack = this.defender_stacks[i];
			if (stack.count > 0) {
				this.do_attack(stack, this.attacker_stacks, false);
			}
		}
		*/
	},

	get_unit_info: function(unit) {
		var unit_info = this.unit_db[unit];
		return unit_info;
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
				(a_unit.damage_mod[d_stack.unit] > a_unit.damage_mod[mt_stack.unit])) {

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
							(a_unit.damage_mod[d_stack.unit] > a_unit.damage_mod[t_stack.unit])) {
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
			var dmod = a_unit.damage_mod[t_stack.unit];
			var damage = a_stack.count * a_unit_lv.attack * dmod;
			if (is_miss) {
				damage *= 0.5;
			}

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

	// private
	make_stacks: function(units) {
		// sort units by their attack order first
		var sim = this;
		units.sort(function(a, b) {
			return sim.get_unit_info(a.unit).attack_order - sim.get_unit_info(b.unit).attack_order;
		});

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

//////////////////////////////////////////////////////////////////////////////
// UI
//////////////////////////////////////////////////////////////////////////////
$(function() {
	var sim = new simulator();
	window.sim = sim;
	sim.ready(function() {
		var attacker = [];
		var defender = [];

		sim.set_combat_callbacks(
			// damage
			function(stack, t_stack, damage, is_attacker) {
				if (t_stack) {
					if (is_attacker) {
						$("#battle_log").append(sformat("<div class='log_line log_damage'><img class='log_unit_image' src='{7}'> {5}x{6} &lt;= {4} &lt;= <img class='log_unit_image' src='{3}'> {1}x{2}</div>", 
							stack.unit,
							stack.count,
							sim.get_unit_info(stack.unit).image,
							damage.toFixed(1),
							t_stack.unit,
							t_stack.count,
							sim.get_unit_info(t_stack.unit).image));
					}
					else {
						$("#battle_log").append(sformat("<div class='log_line log_damage'><img class='log_unit_image' src='{3}'> {1}x{2} =&gt; {4} =&gt; <img class='log_unit_image' src='{7}'> {5}x{6}</div>", 
							stack.unit,
							stack.count,
							sim.get_unit_info(stack.unit).image,
							damage.toFixed(1),
							t_stack.unit,
							t_stack.count,
							sim.get_unit_info(t_stack.unit).image));
					}
				}
				else {
					$("#battle_log").append("<br>");
				}
			},
			// stack death
			function(stack, is_attacker) {
				$("#battle_log").append(sformat("<div class='log_defeat'>{1} ({2}) was defeated</div>", stack.unit, is_attacker ? "attacker" : "defender"));
			})

		// ui stuff
		var current_army;
		var prev_ser_state;

		function update_url() {
			prev_ser_state = serialize_state();
			window.location.hash = encodeURIComponent(prev_ser_state);
		};

		function update_from_url() {
			var data = decodeURIComponent(window.location.hash.substr(1));
			if (data != prev_ser_state) {
				prev_ser_state = data;
				deserialize_state(data);
				reset_battle();
			}
		}

		function serialize_state() {
			return sformat("{1}-{2}", serialize_army(attacker), serialize_army(defender));
		}

		function serialize_army(army) {
			var strs = [];
			for (var i in army) {
				var unit = army[i];
				strs.push(sformat("{1}{2}x{3}", unit.unit, unit.level, unit.count))
			}
			return strs.join("~");
		}

		function deserialize_state(data) {
			var data_armies = data.split("-");
			if (data_armies.length == 2) {
				attacker = deserialize_army(data_armies[0]);
				defender = deserialize_army(data_armies[1]);
			}
		}

		function deserialize_army(army_data) {
			var re = /([^\d]+)(\d+)x(\d+)/
			var units = army_data.split("~");
			var army = []

			for (var i in units) {
				var unit_data = units[i];
				var result = re.exec(unit_data);

				if (result && result.length == 4) {
					var unit = {
						unit: result[1],
						level: parseInt(result[2], 10),
						count: parseInt(result[3], 10)
					};

					var info = sim.get_unit_info(unit.unit);
					if (info != null && unit.level >= 1 && info.levels[unit.level - 1] != null &&
						unit.count > 0 && unit.count < 1000000) {
						army.push(unit);
					}
				}
			}
			return army;
		}

		function display_stacks(stacks, div) {
			div.empty();
			for (var i = 0; i < stacks.length; ++i) {
				var stack = stacks[i];
				div.append(sformat("<div class='unit_stack' title='{1} (lv.{2}) (hp: {5}/{6} damage done: {7})'><img class='unit_stack_image' src='{4}'><span class'unit_stack_text'>{3}</span></div>",
				    stack.unit, stack.level, stack.count, sim.get_unit_info(stack.unit).image, 
					stack.hp.toFixed(1), stack.hp_max.toFixed(1), stack.damage_dealt.toFixed(1)));
			}
		};

		function close_toplevel_dialog() {
			if ($("#army_add_dialog:visible").length > 0) {
				$("#army_add_dialog").hide();
				$("#fullscreen_modal_background").css("z-index", 1);
			}
			else {
				$("#army_dialog").hide();
				$("#fullscreen_modal_background").hide();
			}
		};

		function show_army_dialog(army, is_attacker) {
			current_army = army;
			$("#army_dialog_type").text(is_attacker ? "Attacker" : "Defender");
			$("#fullscreen_modal_background").css("z-index", 1);
			$("#fullscreen_modal_background").show();
			populate_army_dialog_army(army);
			$("#army_dialog").show();
		};

		function populate_army_dialog_army(army) {
			$("#army_dialog_army_unit_list").empty();
			for (var i in army) {
				var unit = army[i];
				var el = $(sformat("<div class='unit_stack' title='{1} (lv.{2})'><img class='unit_stack_image' src='{4}'><span class'unit_stack_text'>{3}</span></div>", 
					unit.unit, unit.level, unit.count, sim.get_unit_info(unit.unit).image));

				var button = $("<button>x</button>");
				el.prepend(button)
				$("#army_dialog_army_unit_list").append(el);
				button.click((function(i) { return function() { remove_current_army_unit(i); }; })(i));
			}

			var cost = sim.get_army_cost(army);
			$("#army_dialog_cost").empty().append(
				$(sformat("<span>{1}<span class='resource-labor'></span> {2}<span class='resource-gold'></span> {3}<span class='resource-wood'></span> {4}<span class='resource-crop'></span> {5}<span class='resource-iron'></span></span>", cost.labor, cost.gold, cost.wood, cost.crop, cost.iron)));
			$("#army_dialog_upkeep").text(cost.upkeep);
			
			update_url();
		};

		function show_army_add_dialog(unit) {
			// fill level drop down
			$("#army_add_dialog_unit_level").empty();
			for (var i = 1; i <= sim.get_unit_info(unit).levels.length; ++i) {
				var el = $(sformat("<option value='{1}'>{1}</option>", i));
				$("#army_add_dialog_unit_level").append(el);
			}
			$("#fullscreen_modal_background").css("z-index", 2);
			$("#army_add_dialog_unit_name").text(unit);
			$("#army_add_dialog").show();
		}

		function add_current_army_unit(unit, level, count) {
			var unitdef = {
				unit: unit,
				level: level,
				count: count	
			};
			current_army.push(unitdef);
			populate_army_dialog_army(current_army);
			reset_battle();
		}

		function remove_current_army_unit(index) {
			current_army.splice(index, 1);
			populate_army_dialog_army(current_army);
			reset_battle();
		}

		// load state
		update_from_url();

		// fill available unit list
		for (var i in sim.unit_db) {
			var unit = sim.unit_db[i];
			if (unit.name) {
				var button = $(sformat("<div class='army_available_unit'><img class='army_available_unit_image' src='{2}'><br>{1}</div>", unit.name, unit.image));
				button.click((function(unit) { return function() { show_army_add_dialog(unit.name); } })(unit));

				$(unit.type == "structure" ? "#army_dialog_available_structure_list" : "#army_dialog_available_unit_list").append(button); 
			}
		}

		// battle stuff
		var current_round = 1;

		function reset_battle() { 
			sim.set_attacker(attacker);
			sim.set_defender(defender);

			display_stacks(sim.get_attacker_stacks(), $("#attacker"));
			display_stacks(sim.get_defender_stacks(), $("#defender"));
			
			$("#battle_log").empty();
			
			current_round = 1;
		}

		function run_round() {
			$("#battle_log").append(sformat("<div class='log_round_header'>Round {1}</div>", current_round))
			sim.do_round();

			display_stacks(sim.get_attacker_stacks(), $("#attacker"));
			display_stacks(sim.get_defender_stacks(), $("#defender"));

			current_round++;
		}

		reset_battle();

		// ui callbacks
		$("#reset_button").click(function() {
			reset_battle();
		});

		$("#play_all_button").click(function() {
			if (current_round > 20 || !sim.is_in_combat())
				reset_battle();

			while (current_round <= 20 && sim.is_in_combat()) {
				run_round();
			}
			$("#battle_log").animate({ scrollTop: $("#battle_log")[0].scrollHeight }, "fast");
		});

		$("#next_round_button").click(function() {
			if (sim.is_in_combat()) {
				run_round();
				$("#battle_log").animate({ scrollTop: $("#battle_log")[0].scrollHeight }, "fast");
			}
		});

		$("#edit_attacker_button").click(function() {
			show_army_dialog(attacker, true);
		});

		$("#edit_defender_button").click(function() {
			show_army_dialog(defender, false);
		});

		$("#army_dialog_close_button").click(function() {
			close_toplevel_dialog();
		});

		$("#army_add_dialog_add_button").click(function() {
			var name = $("#army_add_dialog_unit_name").text();
			var level = $("#army_add_dialog_unit_level").val();
			var count = $("#army_add_dialog_unit_amount").val();

			add_current_army_unit(name, level, count);
			close_toplevel_dialog();
		});

		$("#army_add_dialog_cancel_button").click(function() {
			close_toplevel_dialog();
		});

		$(window).on("hashchange", function() {
			update_from_url();
		});

		$(document).keydown(function(e) {
			// esc
			if (e.which == 27) {
				close_toplevel_dialog();
			}
		});
	});
});
//
})();