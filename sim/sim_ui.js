(function() {
function sformat(str) {
	var args = arguments;
	return str.replace(/{(\d+)}/g, function(match, number) { 
		return typeof args[number] != 'undefined'
			? args[number]
			: match;
		});
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
						$("#battle_log").append(sformat("<div class='log_line log_damage'><img class='log_unit_image' src='{7}'> {5}x{6} (defender) <span class='combat-attack'></span> {4} <span class='combat-left'></span> <img class='log_unit_image' src='{3}'> {1}x{2} (attacker)</div>", 
							stack.unit,
							stack.count,
							sim.get_unit_info(stack.unit).image,
							damage.toFixed(1),
							t_stack.unit,
							t_stack.count,
							sim.get_unit_info(t_stack.unit).image));
					}
					else {
						$("#battle_log").append(sformat("<div class='log_line log_damage'><img class='log_unit_image' src='{3}'> {1}x{2} (defender) <span class='combat-defend'></span> {4} <span class='combat-right'></span> <img class='log_unit_image' src='{7}'> {5}x{6} (attacker)</div>", 
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
					if (info != null && unit.level >= 1 && info.levels && info.levels[unit.level - 1] != null &&
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
				div.append(sformat("<div class='unit_stack' title='{1} (lv.{2}) (hp: {5}/{6} damage done: {7})\n{8}'><img class='unit_stack_image' src='{4}'><span class='unit_stack_text'>{3}</span></div>",
				    stack.unit, stack.level, stack.count, sim.get_unit_info(stack.unit).image, 
					stack.hp.toFixed(1), stack.hp_max.toFixed(1), stack.damage_dealt.toFixed(1),
					(stack.count - stack.count_max) || ""));
			}
		};

		function display_losses(losses, div) {
			div.empty();
			if (losses.length > 0) {
				div.append($("<span>Losses:</span>"));
				for (var i = 0; i < losses.length; ++i) {
					var stack = losses[i];
					div.append(sformat("<div class='unit_stack_loss' title='{1} (lv.{2})'><img class='unit_stack_loss_image' src='{4}'><span class='unit_stack_loss_text'>{3}</span></div>",
					    stack.unit, stack.level, stack.count, sim.get_unit_info(stack.unit).image));
				}
				div.append("<span>&nbsp;=&nbsp;&nbsp;</span>")
				var cost = sim.get_army_cost(losses);
				div.append(format_cost(cost));
			}
		}

		function update_battle_display() {
			display_stacks(sim.get_attacker_stacks(), $("#attacker"));
			display_stacks(sim.get_defender_stacks(), $("#defender"));

			display_losses(sim.get_army_losses(sim.get_attacker_stacks()), $("#attacker_summary"));
			display_losses(sim.get_army_losses(sim.get_defender_stacks()), $("#defender_summary"));
		}

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

		function format_cost(cost) {
			return sformat("<span class='cost'>{1}<span class='resource-labor'></span>{2}<span class='resource-gold'></span>{3}<span class='resource-wood'></span>{4}<span class='resource-crop'></span>{5}<span class='resource-iron'></span></span>", cost.labor, cost.gold, cost.wood, cost.crop, cost.iron);
		}

		function zero_pad(n, len) {
			var zerostr = "";
			for (var i = 0; i < len; ++i) zerostr += "0";
			var tmp = n.toString(10);
			var tmp2 = zerostr.concat(tmp);
			return tmp2.substring(tmp2.length - len);
		}

		function format_time(time) {
			var h = time / 3600;
			var m = (time % 3600) / 60;
			var s = time % 60;
			return sformat("{1}:{2}:{3}", zero_pad(Math.floor(h), 2), zero_pad(Math.floor(m), 2), zero_pad(Math.floor(s), 2)); 
		}

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
			$("#army_dialog_cost").empty().append($(format_cost(cost)));
			$("#army_dialog_upkeep").text(cost.upkeep);
			
			update_url();
		};

		function update_army_add_dialog_unit_stats() {
			var name = $("#army_add_dialog_unit_name").text();
			var level = $("#army_add_dialog_unit_level").val() || 1;

			var ui = sim.get_unit_info(name);
			var lv = ui.levels[level - 1];

			$("#army_add_dialog_unit_cost").empty().append(format_cost(lv.cost))
			$("#army_add_dialog_unit_time").text(format_time(lv.cost.time));
			$("#army_add_dialog_unit_hp").text(lv.hp);
			$("#army_add_dialog_unit_attack").text(lv.attack);
			$("#army_add_dialog_unit_range").text(lv.range);
			$("#army_add_dialog_unit_speed").text(lv.speed);
			$("#army_add_dialog_unit_splash").text(lv.splash);
			$("#army_add_dialog_unit_carry").text(lv.carry || "N/A");
			$("#army_add_dialog_unit_position").text(lv.position);
			$("#army_add_dialog_unit_upkeep").text(lv.upkeep || "N/A");
		}

		function show_army_add_dialog(unit) {
			// fill level drop down
			$("#army_add_dialog_unit_level").empty();
			for (var i = 1; i <= sim.get_unit_info(unit).levels.length; ++i) {
				var el = $(sformat("<option value='{1}'>{1}</option>", i));
				$("#army_add_dialog_unit_level").append(el);
			}

			// fill unit data
			var ui = sim.get_unit_info(unit)
			$("#army_add_dialog_unit_name").text(unit);
			$("#army_add_dialog_unit_image").attr("src", ui.image);
			update_army_add_dialog_unit_stats();

			$("#fullscreen_modal_background").css("z-index", 2);
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

			update_battle_display();
			
			$("#battle_log").empty();
			
			current_round = 1;
		}

		function run_round() {
			$("#battle_log").append(sformat("<div class='log_round_header'>Round {1}</div>", current_round))
			sim.do_round();

			update_battle_display();

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

		$("#army_add_dialog_unit_level").change(function() {
			update_army_add_dialog_unit_stats();
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