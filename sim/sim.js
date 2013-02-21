//first, checks if it isn't implemented yet
sformat = function(str) {
    var args = arguments;
    return str.replace(/{(\d+)}/g, function(match, number) { 
      return typeof args[number] != 'undefined'
        ? args[number]
        : match
      ;
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
}

function simulator() {
	var sim = this;

	$.getJSON("unit_db.json")
		.success(function(data) {
			sim.unit_db = data;
		})
		.error(function() {
			alert("error loading unit data file");
		});

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
}

simulator.prototype = {
	// public
	ready: function(ready_fn) {
		this.ready_fn = ready_fn;
		if (this.is_ready && ready_fn)
			ready_fn();
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

	set_combat_callbacks: function(damage) {
		this.damage_fn = damage;
	},

	do_round: function() {
		for (var i = 0; i < this.attacker_stacks.length; ++i) {
			var stack = this.attacker_stacks[i];
			if(stack.count > 0)
				this.do_attack(stack, this.defender_stacks, true);
		}
		for (var i = 0; i < this.defender_stacks.length; ++i) {
			var stack = this.defender_stacks[i];
			if(stack.count > 0)
				this.do_attack(stack, this.attacker_stacks, false);
		}
	},

	do_attack: function(stack, target_stacks, is_attacker) {
		var t_stack;
		var a_unit = this.unit_db[stack.unit];
		if (!stack.target || stack.target.count == 0) {
			// choose new target
			var t_unit
			for (var i = 0; i < target_stacks.length; ++i) {
				var d_stack = target_stacks[i];
				var d_unit = this.unit_db[d_stack.unit];
				
				if (d_stack.count == 0)
					continue;

				if (// choose first
					!t_stack ||
					// choose by range
					(a_unit.range < t_unit.position && a_unit.range >= d_unit.position) ||
					// choose by damage modifier
					(a_unit.damage_mod[d_stack.unit] > a_unit.damage_mod[t_stack.unit])) {

					t_stack = d_stack;
					t_unit = d_unit;
				}
			}
		}
		else {
			t_stack = stack.target;
		}
		
		if (!t_stack)
			// no more targets left, battle is over
			return;

		// got target, do dmg
		console.log("stack", stack);
		var dmod = a_unit.damage_mod[t_stack.unit];
		var dmg = stack.count * this.unit_db[stack.unit].levels[stack.level - 1].attack * dmod;

		if (this.damage_fn) {
			this.damage_fn(stack, t_stack, dmg, is_attacker);
		}

		t_stack.count = 0;
	},

	is_combat: function() {
		return false;
	},

	// private
	make_stacks: function(units) {
		var stacks = [];
		for (var i = 0; i < units.length; ++i) {
			var unit = units[i];
			var stack_size = this.unit_db[unit.unit].stack_size[unit.level - 1] 
			var count_left = unit.count;
			while (count_left > 0) {
				var count;
				if (count_left > stack_size)
					count = stack_size;
				else
					count = count_left; 
				var stack = {
					unit: unit.unit,
					level: unit.level,
					count: count
				};
				stacks[stacks.length] = stack;
				count_left = count_left - count;
			}
		}
		return stacks;
	}
}

//////////////////////////////////// UI
function display_units(units, div) {
	div.empty();
	for (var i = 0; i < units.length; ++i) {
		var unit = units[i];
		div.append("<div>" + unit.unit + "(" + unit.level + ") x" + unit.count + "</div>");
	}
}

$(function() {
	var sim = new simulator()
	window.sim = sim
	sim.ready(function() {
		attacker = [
			{
				unit: "Archer",
				level: 1,
				count: 20,
			},
			{
				unit: "Swordsman",
				level: 3,
				count: 40
			}
		]
		defender = [
			{
				unit: "Cavalry",
				level: 1,
				count: 5,
			},
			{
				unit: "Fighter",
				level: 3,
				count: 50
			}
		]

		sim.set_combat_callbacks(
			function(stack, t_stack, damage, is_attacker) {
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
			})

		sim.set_attacker(attacker);
		sim.set_defender(defender);

		display_units(sim.get_attacker_stacks(), $("#attacker"));
		display_units(sim.get_defender_stacks(), $("#defender"));

		//while(sim.is_combat()) {
		for (var i = 1; i <= 20; ++i) {
			$("#battle_log").append(sformat("<br><b>Round {1}</b><br><br>", i))
			sim.do_round();
		}
	});
});
