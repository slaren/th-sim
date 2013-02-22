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

function shuffle_array(myArray) {
	var i = myArray.length, j, tempi, tempj;
	if ( i == 0 ) return false;
	while ( --i ) {
		j = Math.floor( Math.random() * ( i + 1 ) );
		tempi = myArray[i];
		tempj = myArray[j];
		myArray[i] = tempj;
		myArray[j] = tempi;
	}
};

function simulator() {
	var sim = this;

	// todo: load both files on paralell
	$.getJSON("unit_db.json")
		.success(function(data) {
			sim.unit_db = data;
			$.getJSON("unit_db_static.json")
				.success(function(data) {
					for (unit in data) {
						if(!sim.unit_db[unit])
							sim.unit_db[unit] = {};

						for (field in data[unit]) {
							sim.unit_db[unit][field] = data[unit][field]
						}
					}
					if (sim.ready_fn)
						sim.ready_fn();
					sim.is_ready = true;
				})
				.error(function() {
					alert("error loading static data file");
				});
		})
		.error(function() {
			alert("error loading unit data file");
		});

};

simulator.prototype = {
	// public
	ready: function(ready_fn) {
		if (this.is_ready && ready_fn)
			ready_fn();
		this.ready_fn = ready_fn;
	},

	set_attacker: function(attacker) {
		this.attacker_stacks = this.make_stacks(attacker);
	},

	set_defender: function(defender) {
		this.defender_stacks = this.make_stacks(defender);
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

	do_round: function() {
		shuffle_array(this.attacker_stacks);
		shuffle_array(this.defender_stacks);

		// randomize order of attacks
		var order = []
		for (var i = 0; i < (this.attacker_stacks.length + this.defender_stacks.length); ++i)
			order[i] = i;
		shuffle_array(order);

		for (var i = 0; i < order.length; ++i) {
			var nstack = order[i];
			if(nstack < this.attacker_stacks.length) {
				var stack = this.attacker_stacks[nstack];
				if(stack.count > 0) {
					this.do_attack(stack, this.defender_stacks, true);
				}
			}
			else {
				var stack = this.defender_stacks[nstack - this.attacker_stacks.length];
				if(stack.count > 0) {
					this.do_attack(stack, this.attacker_stacks, false);
				}
			}
		}

		/*
		// sequential order of attacks
		for (var i = 0; i < this.attacker_stacks.length; ++i) {
			var stack = this.attacker_stacks[i];
			if(stack.count > 0) {
				this.do_attack(stack, this.defender_stacks, true);
			}
		}
		for (var i = 0; i < this.defender_stacks.length; ++i) {
			var stack = this.defender_stacks[i];
			if(stack.count > 0) {
				this.do_attack(stack, this.attacker_stacks, false);
			}
		}
		*/
	},

	get_stack_targets: function(a_stack, target_stacks) {
		var a_unit = this.unit_db[a_stack.unit];
		var a_unit_lv = a_unit.levels[a_stack.level - 1];
		var splash = a_unit.levels[a_stack.level - 1].splash;
		var targets = [];
		var mt_stack, mt_unit, mt_unit_lv
		if (!a_stack.targets || a_stack.targets.length == 0 || a_stack.targets[0].count == 0) {
			// choose new main target
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
		}
		else {
			mt_stack = a_stack.targets[0];
			mt_unit = this.unit_db[mt_stack.unit];
			mt_unit_lv = mt_unit.levels[mt_stack.level - 1];
		}

		if(mt_stack) {
			targets[0] = mt_stack;
			// find splash targets
			for (var nt = 1; nt < splash; ++nt) {
				var t_stack, t_unit, t_unit_lv;
				t_stack = t_unit = t_unit_lv = null;

				for (var i = 0; i < target_stacks.length; ++i) {
					var d_stack = target_stacks[i];
					var d_unit = this.unit_db[d_stack.unit];
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

		a_stack.targets = targets;

		return targets;
	},
		
	do_attack: function(a_stack, target_stacks, is_attacker) {
		var a_unit = this.unit_db[a_stack.unit];
		var a_unit_lv = a_unit.levels[a_stack.level - 1];
		
		var t_stacks = this.get_stack_targets(a_stack, target_stacks);

		if (!t_stacks.length)
			// no more targets left, battle is over
			return;

		// got target, do damage
		for (var i = 0; i < t_stacks.length; ++i) {
			var t_stack = t_stacks[i];
			var t_unit = this.unit_db[t_stack.unit];
			var t_unit_lv = t_unit.levels[t_stack.level - 1];

			var dmod = a_unit.damage_mod[t_stack.unit];
			var damage = a_stack.count * a_unit_lv.attack * dmod;

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
		var stacks = [];
		for (var i = 0; i < units.length; ++i) {
			var unit = units[i];
			var stack_size = this.unit_db[unit.unit].stack_size[unit.level - 1] 
			var count_left = unit.count;
			while (count_left > 0) {
				var count = (count_left > stack_size) ? stack_size : count_left;
				var hp_max = this.unit_db[unit.unit].levels[unit.level - 1].hp * count

				var stack = {
					unit: unit.unit,
					level: unit.level,
					count_max: count,
					count: count,
					hp_max: hp_max,
					hp: hp_max,
					damage_dealt: 0,
				};
				stacks[stacks.length] = stack;
				count_left = count_left - count;
			}
		}
		return stacks;
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
						$("#battle_log").append(sformat("{4}x{5} <= {3} <= {1}x{2}<br>", 
							stack.unit,
							stack.count,
							damage.toFixed(1),
							t_stack.unit,
							t_stack.count));
					}
					else {
						$("#battle_log").append(sformat("{1}x{2} => {3} => {4}x{5}<br>", 
							stack.unit,
							stack.count,
							damage.toFixed(1),
							t_stack.unit,
							t_stack.count));
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
		function display_stacks(stacks, div) {
			div.empty();
			stacks.sort(function(a, b) {
				return b.unit < a.unit;
			})
			for (var i = 0; i < stacks.length; ++i) {
				var stack = stacks[i];
				div.append(sformat("<div>{1} (lv.{2}) x{3} (hp: {4}/{5} damage dealt: {6})</div>", stack.unit, stack.level, stack.count, 
					stack.hp.toFixed(1), stack.hp_max.toFixed(1), stack.damage_dealt.toFixed(1)));
			}
		};

		var current_army;

		function close_toplevel_dialog() {
			if ($("#army_add_dialog:visible").length > 0) {
				$("#army_add_dialog").hide();
				$("#fullscreen_modal_background").css("z-index", 1);
			}
			else {
				$("#army_dialog").hide();
				$("#fullscreen_modal_background").hide();
			}
		}

		function show_army_dialog(army, is_attacker) {
			current_army = army;
			$("#army_dialog_type").text(is_attacker ? "Attacker" : "Defender");
			$("#fullscreen_modal_background").css("z-index", 1);
			$("#fullscreen_modal_background").show();
			populate_army_dialog_army(army);
			$("#army_dialog").show();
		}

		function populate_army_dialog_army(army) {
			var crop = 0, gold = 0, iron = 0, labor = 0, time = 0, wood = 0;
			var upkeep = 0;

			$("#army_dialog_army_unit_list").empty();
			for (var i in army) {
				var unit = army[i];
				var el = $(sformat("<div class='army_added_unit'>{3}x {1} (lv. {2})</div>", unit.unit, unit.level, unit.count));
				var button = $("<button>x</button>");
				el.prepend(button)
				$("#army_dialog_army_unit_list").append(el);
				button.click((function(army, i) { return function(i) { remove_current_army_unit(i); }; })(i));

				var unit_lv = sim.unit_db[unit.unit].levels[unit.level];
				crop += unit_lv.cost.crop * unit.count;
				gold += unit_lv.cost.gold * unit.count;
				iron += unit_lv.cost.iron * unit.count;
				labor+= unit_lv.cost.labor * unit.count;
				time += unit_lv.cost.time * unit.count;
				wood += unit_lv.cost.wood * unit.count;
				upkeep += unit_lv.upkeep * unit.count;
			}

			$("#army_dialog_cost").text(sformat("{1}l {2}g {3}w {4}c {5}i", labor, gold, wood, crop, iron));
			$("#army_dialog_upkeep").text(upkeep);
		}

		function show_army_add_dialog(unit) {
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

		// fill available unit list
		for (var i in sim.unit_db) {
			var unit = sim.unit_db[i];
			if (unit.name) {
				var button = $(sformat("<button class='army_available_unit'>{1}</button>", unit.name));
				button.click((function(unit) { return function() { show_army_add_dialog(unit.name); } })(unit));

				$("#army_dialog_available_unit_list").append(button); 
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

		// button callbacks
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
			if(current_round <= 20 && sim.is_in_combat()) {
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
			console.log(name, level, count);
			add_current_army_unit(name, level, count);
			close_toplevel_dialog();
		});

		$("#army_add_dialog_cancel_button").click(function() {
			close_toplevel_dialog();
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