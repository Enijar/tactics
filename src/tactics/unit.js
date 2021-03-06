(function ()
{
	var turns,turnsUnit;
	var selectTurnEvent,focusTurnEvent,blurTurnEvent;
	var shocks;

	/*
		Pre-calculate the display and handling of the turn options.
	*/
	turns = new PIXI.Container();

	selectTurnEvent = function (event)
	{
		Tactics.sounds.select.play();
		turnsUnit.turn(event.target.data.direction);

		Tactics.board.setSelectMode('ready');
	};
	focusTurnEvent = function (event)
	{
		var filter = new PIXI.filters.ColorMatrixFilter();
		Tactics.sounds.focus.play();

		filter.brightness(1.75);

		event.target.filters = [filter];
		Tactics.render();
	};
	blurTurnEvent = function (event)
	{
		event.target.filters = null;
		Tactics.render();
	};

	$.each(['turn_tl.png','turn_tr.png','turn_bl.png','turn_br.png'],function (i,image)
	{
		var sprite = new PIXI.Sprite.fromImage('http://www.taorankings.com/html5/images/'+image);
		sprite.interactive = true;
		sprite.buttonMode = true;
		sprite.click = selectTurnEvent;
		sprite.tap = selectTurnEvent;
		sprite.mouseover = focusTurnEvent;
		sprite.mouseout = blurTurnEvent;

		if (i == 0)
		{
			sprite.position = new PIXI.Point(1,0);
			sprite.data = {direction:'N'};
		}
		else if (i == 1)
		{
			sprite.position = new PIXI.Point(55,0);
			sprite.data = {direction:'E'};
		}
		else if (i == 2)
		{
			sprite.position = new PIXI.Point(0,30);
			sprite.data = {direction:'W'};
		}
		else if (i == 3)
		{
			sprite.position = new PIXI.Point(55,30);
			sprite.data = {direction:'S'};
		}

		turns.addChild(sprite);
	});

	/*
		Pre-calculate the display of shocks.
	*/
	shocks =
	[
		new PIXI.Sprite.fromImage('http://www.taorankings.com/html5/images/shock.png'),
		new PIXI.Sprite.fromImage('http://www.taorankings.com/html5/images/shock.png'),
		new PIXI.Sprite.fromImage('http://www.taorankings.com/html5/images/shock.png')
	];

	shocks[0].anchor = new PIXI.Point(0.5,0.5);
	shocks[0].scale = new PIXI.Point(4.65,0.65);
	shocks[0].rotation = 0.5;

	shocks[1].anchor = new PIXI.Point(0.5,0.5);
	shocks[1].scale = new PIXI.Point(2,0.7);
	shocks[1].rotation = 0.5;

	shocks[2].anchor = new PIXI.Point(0.5,0.5);
	shocks[2].scale = new PIXI.Point(0.4,3);
	shocks[2].rotation = 0.5;
	shocks[2].alpha = 0.5;

	Tactics.Unit = function (type)
	{
		var self = this;
		var pixi = self.pixi = new PIXI.Container();
		var data = Tactics.units[type];
		var board = Tactics.board;
		var pulse;
		var sounds = $.extend({},Tactics.sounds,data.sounds);
		var stills = data.stills;
		var shock;
		var deployEvent = function (event)
		{
			board.lock();
			self.deploy(event.target).done(function ()
			{
				board
					.setSelectMode(self.attacked ? 'turn' : 'attack')
					.unlock();
			});
		};
		var deployFocusEvent = function (event) { event.target.pixi.alpha = 0.6; };
		var deployBlurEvent  = function (event) { event.target.pixi.alpha = 0.3; };
		var attackSelectEvent = function (event)
		{
			var tile = event.target;
			var unit;

			self.activated = 'target';
			self.highlightTarget(tile);

			if (unit = tile.assigned)
			{
				calc = self.calcAttack(unit);

				unit.change({notice:'-'+calc.damage+' ('+Math.round(calc.chance)+'%)'});
				board.drawCard(unit);
			}
		};
		var attackFocusEvent = function (event)
		{
			var tile = event.target;
			var unit;

			if (unit = tile.assigned)
			{
				calc = self.calcAttack(unit);

				unit.change({notice:'-'+calc.damage+' ('+Math.round(calc.chance)+'%)'});
			}
			else
			{
				tile.pixi.alpha = 0.6;
			}
		};
		var attackBlurEvent = function (event)
		{
			if (!event.target.assigned) event.target.pixi.alpha = 0.3;
		};
		var targetSelectEvent = function (event)
		{
			board.lock();
			self.attack(event.target).done(function ()
			{
				board
					.setSelectMode(self.deployed ? 'turn' : 'move')
					.unlock();
			});
		};
		var highlighted = [];

		utils.addEvents.call(self);

		$.extend(self,
		{
			// Public properties
			pixi:undefined,
			filters:{},

			team:undefined,
			color:0,
			type:type,
			name:data.name,
			sprite:undefined,
			assignment:undefined,

			title:undefined,
			notice:undefined,
			activated:false,
			focused:false,
			origin:{},
			deployed:false,
			attacked:false,

			mPass:data.mPass,
			mRadius:data.mRadius,
			aRadius:data.aRadius,

			health:data.health,
			blocking:data.blocking,
			power:data.power,
			armor:data.armor,
			recovery:data.recovery,
			directional:data.directional,

			mHealth:0,
			mBlocking:0,
			mPower:0,
			mArmor:0,
			mRecovery:0,

			ability:data.ability,
			specialty:data.specialty,

			poisoned:false,
			paralyzed:false,
			barriered:false,

			getMoveTiles:function (start)
			{
				var tiles = [];
				var x,y;
				var r=data.mRadius;
				var cx,cy;
				var tile;
				var path;

				start = start || self.assignment;
				cx = start.x;
				cy = start.y;

				for (x=cx-r; x<=cx+r; x++)
				{
					for (y=cy-r; y<=cy+r; y++)
					{
						if (!(tile = board.getTile(x,y))) continue;
						if (tile.assigned) continue;
						if (board.getDistance(start,tile) > r) continue;

						if (!(path = self.findPath(tile))) continue;
						if (path.length > r) continue;

						tiles.push(tile);
					}
				}

				return tiles;
			},
			getAttackTiles:function (start)
			{
				var tiles = [];
				var x,y;
				var r=data.aRadius;
				var cx,cy;
				var tile;

				start = start || self.assignment;
				cx = start.x;
				cy = start.y;

				for (x=cx-r; x<=cx+r; x++)
				{
					for (y=cy-r; y<=cy+r; y++)
					{
						if (data.aLinear && x != cx && y != cy) continue;
						if (!(tile = board.getTile(x,y))) continue;
						if (tile === start) continue;
						if (board.getDistance(start,tile) > r) continue;

						tiles.push(tile);
					}
				}

				return tiles;
			},
			targetLOS:function (target,from)
			{
				var x,y;
				from = from || self.assignment;

				// Any way to make this more efficient?

				// Horizontal
				if (target.x === from.x)
				{
					if (target.y > from.y)
					{
						for (y=from.y+1; y<target.y; y++)
						{
							tile = board.getTile(target.x,y);
							if (tile.assigned) return tile;
						}
					}
					else
					{
						for (y=from.y-1; y>target.y; y--)
						{
							tile = board.getTile(target.x,y);
							if (tile.assigned) return tile;
						}
					}
				}
				// Vertical
				else if (target.y === from.y)
				{
					if (target.x > from.x)
					{
						for (x=from.x+1; x<target.x; x++)
						{
							tile = board.getTile(x,target.y);
							if (tile.assigned) return tile;
						}
					}
					else
					{
						for (x=from.x-1; x>target.x; x--)
						{
							tile = board.getTile(x,target.y);
							if (tile.assigned) return tile;
						}
					}
				}

				return target;
			},
			calcAttack:function (target,from)
			{
				var direction;
				var calc =
				{
					damage:Math.round((self.power+self.mPower) * (1 - (target.armor+target.mArmor)/100)),
					block:target.blocking + target.mBlocking,
					chance:100,
					penalty:0,
					bonus:0,
					unblockable:true
				};

				if (calc.damage === 0) calc.damage = 1;

				if (data.aLOS && self.targetLOS(target.assignment,from) !== target.assignment)
				{
					calc.chance = 0;
					calc.unblockable = false;
					return calc;
				}

				if (data.aType === 'melee')
				{
					if (target.directional !== false)
					{
						direction = board.getDirection(from || self.assignment,target.assignment);

						if (direction.indexOf(target.direction) > -1)
						{
							calc.block = 0;
							return calc;
						}
						else if (direction.indexOf(board.getRotation(target.direction,180)) > -1)
						{
							calc.penalty = 100-target.blocking;
						}
						else
						{
							calc.block /= 2;
							calc.penalty = 200-target.blocking;
						}
						calc.bonus = target.blocking;
					}

					if (calc.block <   0) calc.block = 0;
					if (calc.block > 100) calc.block = 100;
					calc.chance = 100 - calc.block;
					calc.unblockable = false;
				}

				return calc;
			},
			// Obtain the maximum threat to the unit before he recovers.
			calcDefense:function (turns)
			{
				var damages = [],damage = 0,threat;
				var i,j,units,unit,cnt,turns;

				if (!turns) turns = board.turns;

				for (i=0; i<board.teams.length; i++)
				{
					damages.push([]);

					// Don't consider allies or friends or self.
					if (board.teams[i].color === board.teams[self.team].color) continue;
					units = board.teams[i].units;

					for (j=0; j<units.length; j++)
					{
						unit = units[j];
						cnt = unit.calcThreatTurns(self,1);

						if (cnt  >  self.mRecovery) continue;
						if (cnt === self.mRecovery && turns.indexOf(i) > turns.indexOf(self.team)) continue;
						threat = unit.calcThreat(self,null,turns);
						if (threat.damage)
							damages[i].push
							({
								unit:unit,
								turns:threat.turns+1-unit.mRecovery,
								damage:threat.damage
							});
					}

					damages[i].sort(function (a,b)
					{
						return (b.damage-a.damage) || (a.turns-b.turns);
					});
				}

				for (i=0; i<damages.length; i++)
				{
					if (!damages[i].length) continue;

					// The number of times they can attack before recovery.
					cnt = self.mRecovery;
					// We can attack one more time if enemy turn comes first.
					if (turns.indexOf(i) < turns.indexOf(self.team)) cnt++;

					for (j=0; j<damages[i].length; j++)
					{
						// Only attackers that can attack before he moves again count.
						if (!cnt) break;

						if (damages[i][j].turns > cnt) continue;

						damage += damages[i][j].damage;
						cnt -= damages[i][j].turns;
					}
				}

				return damage > 100 ? 0 : 100 - damage;
			},
			// How many turns until I can attack?
			// -1 may be returned if no movement required (unless simple is set)
			calcThreatTurns:function (target,simple)
			{
				var turns = Math.ceil((board.getDistance(self.assignment,target.assignment) - self.aRadius) / self.mRadius) - 1;

				if (turns < 0 && (self.mRecovery || simple))
					return self.mRecovery;

				return turns+self.mRecovery;
			},
			calcThreats:function (target,limit)
			{
				var threats = [];
				var directions = ['N','S','E','W'];
				var tile,calc,threat;

				//if (self.mRecovery > target.mRecovery) return;
				//if (self.mRecovery === target.mRecovery && board.turns.indexOf(self.team) > board.turns.indexOf(target.team)) return;

				for (i=0; i<directions.length; i++)
				{
					if (!(tile = target.assignment[directions[i]])) continue;

					if (tile.assigned)
					{
						if (tile.assigned !== self) continue;
					}
					else
					{
						if (board.getDistance(self.assignment,tile) > mRadius) continue;
						if (!(path = self.findPath(tile))) continue;
						if (path.length > mRadius) continue;
					}

					calc = self.calcAttack(target,tile);
					threat = calc.damage / (target.health+target.mHealth) * 100;
					if (threat > 100) threat = 100;

					// Factor in the chance that the attack may not hit.
					if (calc.chance < 100)
					{
						threat *= calc.chance / 100;

						// Factor in the future benefit of getting additional blocking chance.
						// Actually, if we get hit, we lose blocking chance.  So now what?
						//if (threat < 100)
						//	threat *= 1 - target.blocking/400;
					}

					threats.push({tile:tile,threat:threat});
				}

				if (!threats.length) return;

				return threats.sort(function (a,b) { return b.threat-a.threat; });
			},
			calcThreat:function (target,tile,turns)
			{
				var calc = {};
				var tdirection = target.direction;
				var path,cnt,attack;
				var directions =
				[
					board.getRotation(tdirection,180),
					board.getRotation(tdirection,90),
					board.getRotation(tdirection,270),
					tdirection
				];

				if (!tile)
				{
					if (!turns) turns = board.turns;

					for (i=0; i<directions.length; i++)
					{
						if (!(tile = target.assignment[directions[i]])) continue;

						if (tile.assigned)
						{
							if (tile.assigned == self)
							{
								cnt = 0;
								path = [];
								break;
							}
							continue;
						}

						if (!(path = self.findPath(tile))) continue;

						cnt = Math.ceil(path.length / self.mRadius)-1;

						if (target.mRecovery  >  cnt) break;
						if (target.mRecovery === cnt && turns.indexOf(target.team) > turns.indexOf(self.team)) break;

						path = null;
					}

					if (!path) return {damage:0,threat:0,from:null,turns:null,chance:0};
					tile = path.pop() || self.assignment;
				}

				attack = self.calcAttack(target,tile);

				calc.from = tile;
				calc.turns = cnt;
				calc.chance = attack.chance;
				calc.damage = (attack.damage / target.health) * 100;
				if (calc.damage > 100) calc.damage = 100;

				calc.threat = (attack.damage / (target.health+target.mHealth)) * 100;
				if (calc.threat > 100) calc.threat = 100;

				// Factor in the chance that the attack may not hit.
				if (attack.chance < 100)
				{
					calc.damage *= attack.chance / 100;
					calc.threat *= attack.chance / 100;

					// Factor in the future benefit of getting additional blocking chance.
					// Actually, if we get hit, we lose blocking chance.  So now what?
					//if (threat < 100)
					//	threat *= 1 - target.blocking/400;
				}

				return calc;
			},

			// Public methods
			draw:function (direction,assignment)
			{
				var frames = [];
				var color = board.teams[self.team].color;

				for (i=0; i<data.frames.length; i++)
				{
					frames[i] = self.compileFrame(i);
				}

				self.color = color === null ? 0xFFFFFF : Tactics.colors[color];
				self.frames = frames;

				self.assign(assignment);
				self.direction = direction;
				self.origin = {tile:assignment,direction:direction};

				return self.drawFrame(stills[self.directional === false ? 'S' : direction]);
			},
			compileFrame:function (index)
			{
				var container = new PIXI.Container();
				var frame = data.frames[index];

				if (!frame) return container;
				container.data = frame;

				container.position = new PIXI.Point(frame.x||0,(frame.y||0)-2);
				container.alpha = 'a' in frame ? frame.a : 1;

				$.each(frame.c,function (i,child)
				{
					var sprite = PIXI.Sprite.fromImage('http://www.taorankings.com/html5/units/'+type+'/image'+child.id+'.png');
					sprite.data = child;
					sprite.position = new PIXI.Point(child.x,child.y);
					sprite.alpha = 'a' in child ? child.a : 1;

					if (child.f === 'B')
					{
						sprite.rotation = Math.PI;
						sprite.position.x *= -1;
						sprite.position.y *= -1;
						if (child.w) sprite.position.x += sprite.width - child.w;
						if (child.h) sprite.position.y += sprite.height - child.h;
					}
					else if (child.f === 'H')
					{
console.log(sprite.width+'-'+child.w+'='+(sprite.width - child.w));
						if (child.w) sprite.position.x -= (sprite.width - child.w);
						sprite.scale.x = -1;
//console.log(sprite.width+'-'+child.w+'='+(sprite.width - child.w));
					}

					if (child.s && child.s !== 1)
					{
						sprite.position.x += sprite.width - (sprite.width * child.s);
						sprite.position.y += sprite.height - (sprite.height * child.s);
						sprite.scale = new PIXI.Point(child.s,child.s);
					}

					if (child.n === 'trim')
						sprite.tint = self.color;

					if (child.n === 'shadow')
						sprite.inheritTint = false;

					container.addChild(sprite);
				});

				return container;
			},
			drawAvatar:function ()
			{
				return self.compileFrame(data.stills.S);
			},
			drawFrame:function (index)
			{
				var frame;

				if (self.frame) pixi.removeChild(self.frame);
				pixi.addChildAt(self.frame = frame = self.frames[index],0);

				if (frame.data)
				{
					// Reset Normal Appearance
					frame.position.x = frame.data.x || 0;
					frame.position.y = (frame.data.y || 0) - 2;
					frame.filters = null;
					frame.tint = 0xFFFFFF;

					$.each(frame.children,function (i,sprite)
					{
						sprite.filters = null;

						if (sprite.data.t)
							sprite.tint = sprite.data.t;
						else
							sprite.tint = sprite.data.n === 'trim' ? self.color : 0xFFFFFF;
					});
				}

				self.filters = {};

				return self;
			},
			offsetFrame:function (offset,direction)
			{
				var frame = self.frame;
				offset = {x:Math.round(88 * offset),y:Math.round(56 * offset)};
				direction = direction || self.direction;

				if (direction == 'N')
				{
					frame.position.x -= offset.x;
					frame.position.y -= offset.y;
				}
				else if (direction == 'E')
				{
					frame.position.x += offset.x;
					frame.position.y -= offset.y;
				}
				else if (direction == 'W')
				{
					frame.position.x -= offset.x;
					frame.position.y += offset.y;
				}
				else
				{
					frame.position.x += offset.x;
					frame.position.y += offset.y;
				}

				return self;
			},
			highlightDeployOptions:function ()
			{
				nolight();

				$.each(self.getMoveTiles(),function (i,tile)
				{
					highlight
					({
						action:'deploy',
						tile:tile,
						color:0x0088FF,
						select:deployEvent,
						focus:deployFocusEvent,
						blur:deployBlurEvent
					});

					if (tile.focused) deployFocusEvent({target:tile});
				});

				return self;
			},
			highlightAttack:function ()
			{
				nolight();

				$.each(self.getAttackTiles(),function (i,tile)
				{
					highlight
					({
						action:'attack',
						tile:tile,
						color:0xFF8800,
						select:attackSelectEvent,
						focus:attackFocusEvent,
						blur:attackBlurEvent
					});

					if (tile.focused) attackFocusEvent({target:tile});
				});

				return self;
			},
			highlightTarget:function (target)
			{
				nolight();

				highlight
				({
					action:'target',
					tile:target,
					color:0xFF6600,
					select:targetSelectEvent,
					focus:attackFocusEvent,
					blur:attackBlurEvent
				});

				if (target.focused) attackFocusEvent({target:target});
				if (target.assigned) target.assigned.activate();

				return self;
			},
			showTurnOptions:function ()
			{
				if (self.viewed) return self.showDirection();

				nolight();

				turnsUnit = self;
				turns.position = self.assignment.getCenter().clone();
				turns.position.x -= 43;
				turns.position.y -= 70;

				$.each(turns.children,function (i,arrow)
				{
					arrow.interactive = arrow.buttonMode = true;
					arrow.visible = true;
				});

				if (Tactics.stage.children.indexOf(turns) === -1)
					Tactics.stage.addChild(turns);

				return self;
			},
			hideTurnOptions:function ()
			{
				if (Tactics.stage.children.indexOf(turns) > -1) Tactics.stage.removeChild(turns);

				return self;
			},
			showDirection:function ()
			{
				nolight();
				
				turns.position = self.assignment.getCenter().clone();
				turns.position.x -= 43;
				turns.position.y -= 70;

				$.each(turns.children,function (i,arrow)
				{
					arrow.interactive = arrow.buttonMode = false;
					arrow.visible = self.directional === false || arrow.data.direction == self.direction;
				});

				if (Tactics.stage.children.indexOf(turns) === -1)
					Tactics.stage.addChild(turns);

				return self;
			},
			assign:function (assignment)
			{
				if (self.assignment) self.assignment.dismiss();
				self.assignment = assignment.assign(self);

				pixi.position = assignment.getCenter().clone();

				return self;
			},
			// Animate from one tile to the next
			deploy:function (assignment)
			{
				var deferred = $.Deferred();
				var anim = self.animDeploy(assignment);

				self.freeze();
				self.assignment.dismiss();

				anim.play(function ()
				{
					self.deployed = {first:!self.attacked};
					self.thaw();
					deferred.resolve();
				});

				return deferred.promise();
			},
			attack:function (target)
			{
				var deferred = $.Deferred();
				var anim = new Tactics.Animation({fps:12});
				var fpoint = self.assignment.getCenter();
				var direction = board.getDirection(self.assignment,target);
				var tunit = target.assigned;
				var block,calc,changes;

				if (tunit)
				{
					calc = self.calcAttack(tunit);

					if (block = Math.random()*100 < calc.block)
					{
						changes = {mBlocking:tunit.mBlocking - calc.penalty};
					}
					else
					{
						changes	=
						{
							mHealth:tunit.mHealth - calc.damage,
							mBlocking:tunit.mBlocking + calc.bonus
						};

						if (changes.mHealth < -tunit.health) changes.mHealth = -tunit.health;
					}

					// jQuery does not extend undefined value
					changes.notice = null;
				}

				self.freeze();

				// Turn 90deg to the right before we start walking in the opposite direction.
				if (board.getRotation(self.direction,180) == direction)
				{
					anim.addFrame(function ()
					{
						self.walk(self.assignment,board.getRotation(self.direction,90),-1);
					});
				}

				// Now face the target if we aren't already.
				if (self.direction != direction)
				{
					anim.addFrame(function ()
					{
						self.stand(self.direction = direction);
					});
				}

				// Animate our attack then stand still.
				anim.splice(self.animAttack(direction,block,changes));

				anim.play(function ()
				{
					self.attacked = {target:target,block:block,changes:changes};
					self.origin.adirection = self.direction;
					self.thaw();
					deferred.resolve();
				});

				return deferred.promise();
			},
			shock:function (direction,frameId,block)
			{
        var anchor = self.assignment.getCenter();
				var frame;

				if (shock)
				{
					Tactics.stage.children[1].removeChild(shock);
					shock = undefined;
				}

				if (direction)
				{
					shock = new PIXI.Container();
					shock.addChild(frame = shocks[frameId]);
					shock.position = anchor.clone();
					shock.position.y += 4; // ensure shock graphic overlaps unit.

					Tactics.stage.children[1].addChild(shock);

					if (direction === 'N')
					{
						if (block)
						{
							frame.position = new PIXI.Point(-20,-56);
						}
						else
						{
							frame.position = new PIXI.Point(-9,-49);
						}
					}
					else if (direction === 'S')
					{
						if (block)
						{
							frame.position = new PIXI.Point(24,-27);
						}
						else
						{
							frame.position = new PIXI.Point(13,-34);
						}
					}
					else if (direction === 'W')
					{
						if (block)
						{
							frame.position = new PIXI.Point(-20,-27);
						}
						else
						{
							frame.position = new PIXI.Point(-9,-34);
						}
					}
					else if (direction === 'E')
					{
						if (block)
						{
							frame.position = new PIXI.Point(24,-56);
						}
						else
						{
							frame.position = new PIXI.Point(13,-49);
						}
					}
				}

				return self;
			},
			brightness:function (intensity,whiteness)
			{
				var name = 'brightness';
				var filter;
				var matrix;

				if (intensity === 1 && !whiteness)
				{
					setFilter(name,undefined);
				}
				else
				{
					filter = setFilter(name,'ColorMatrixFilter')
					filter.brightness(intensity)

					if (whiteness)
					{
						matrix = filter.matrix;
						matrix[1 ] = matrix[2 ] =
						matrix[5 ] = matrix[7 ] =
						matrix[10] = matrix[11] = whiteness;
					}
				}

				return self;
			},
			whiten:function (intensity)
			{
				var name = 'whiten';
				var matrix;

				if (!intensity)
				{
					setFilter(name,undefined);
				}
				else
				{
					matrix = setFilter(name,'ColorMatrixFilter').matrix;
					matrix[3] = matrix[8] = matrix[13] = intensity;
				}

				return self;
			},
			findPath:function ()
			{
				// http://en.wikipedia.org/wiki/A*_search_algorithm
				// Modified to avoid tiles with enemy units.
				// Modified to favor a path with no friendly units.
				// Modified to pick a preferred direction, all things being equal.
				var start;
				var goal;
				var path     = [];
				var opened   = [];
				var closed   = [];
				var cameFrom = {};
				var gScore   = {};
				var fScore   = {};
				var current;
				var directions = ['N','S','E','W'],direction;
				var i,neighbor,score;

				if (arguments.length == 1)
				{
					start = self.assignment;
					goal = arguments[0];
				}
				else
				{
					start = arguments[0];
					goal = arguments[1];
				}

				// Some units instantly move from start to goal.
				if (data.mPath === false)
					return [goal];

				opened.push(start);
				gScore[start.id] = 0;
				fScore[start.id] = board.getDistance(start,goal);

				while (opened.length)
				{
					current = opened.shift();

					if (current === goal)
					{
						while (current !== start)
						{
							path.unshift(current);
							current = cameFrom[current.id];
						}

						return path;
					}

					closed.push(current);

					// Apply directional preference and factor it into the score.
					direction = board.getDirection(current,goal);
					directions.sort(function (a,b)
					{
						return direction.indexOf(b) - direction.indexOf(a);
					});

					for (i=0; i<directions.length; i++)
					{
						if (!(neighbor = current[directions[i]])) continue;
						if (neighbor.assigned && (neighbor.assigned.team !== self.team || neighbor.assigned.mPass === false)) continue;
						if (closed.indexOf(neighbor) > -1) continue;

						score = gScore[current.id] + 1 + (i*.1);
						if (neighbor.assigned) score += 0.4;

						if (opened.indexOf(neighbor) === -1 || score < gScore[neighbor.id])
						{
							cameFrom[neighbor.id] = current;
							gScore[neighbor.id] = score;
							fScore[neighbor.id] = score + board.getDistance(neighbor,goal);

							if (opened.indexOf(neighbor) === -1)
								opened.push(neighbor);

							opened.sort(function (a,b)
							{
								return fScore[a.id] - fScore[b.id];
							});
						}
					}
				}

				return;
			},
			turn:function (direction)
			{
				if (self.directional === false) return self;

				if (!isNaN(direction)) direction = board.getRotation(self.direction,direction);
				self.direction = direction;

				self.drawFrame(stills[direction]);

				Tactics.render();

				return self;
			},
			focus:function (viewed)
			{
				if (self.focused) return;
				self.focused = true;

				if (!self.assignment.painted)
					self.assignment.paint('focus',0.3);
				else
					self.assignment.pixi.alpha *= 2;

				return !pulse && !viewed ? startPulse(6) : self;
			},
			blur:function ()
			{
				if (!self.focused) return self;
				self.focused = false;
				self.notice = undefined;

				if (self.assignment.painted === 'focus')
					self.assignment.strip();
				else
					self.assignment.pixi.alpha /= 2;

				return pulse && !self.activated ? stopPulse() : self;
			},
			showMode:function ()
			{
				var mode = self.activated;

				if (mode == 'move')
				{
					self.highlightDeployOptions();
				}
				else if (mode == 'attack')
				{
					self.highlightAttack();
				}
				else if (mode == 'turn')
				{
					self.showTurnOptions();
				}
				else if (mode == 'direction')
				{
					self.showDirection();
				}
			},
			hideMode:function ()
			{
				self.hideTurnOptions();
				nolight();

				Tactics.render();

				return self;
			},
			freeze:function ()
			{
				self.hideMode();
				stopPulse();
			},
			thaw:function ()
			{
				startPulse(4,2);
			},
			activate:function (mode,view)
			{
				var origin = self.origin;

				mode = mode || true;
				self.viewed = view;
				if (self.activated == mode) return;

				self.hideMode();

				if (mode == 'move' && self.deployed)
				{
					self.assign(origin.tile).turn(origin.adirection || origin.direction);
					self.deployed = false;
				}

				self.activated = mode;
				self.showMode();

				return view ? self : startPulse(4,2);
			},
			deactivate:function ()
			{
				if (!self.activated) return self;

				self.hideMode();

				self.activated = self.deployed = self.attacked = false;
				self.origin = {tile:self.assignment,direction:self.direction};

				return stopPulse();
			},
			reset:function ()
			{
				var origin = self.origin;

				if (origin) self.assign(origin.tile).turn(origin.direction);

				return self.deactivate();
			},
			change:function (changes)
			{
				$.extend(self,changes);

				self.emit({type:'change',changes:changes});
			},
			animPulse:function (steps,speed)
			{
				var step = steps;
				var stride = 0.1 * (speed || 1);

				return new Tactics.Animation({fps:12,loop:true,frames:
				[
					{
						script:function ()
						{
							self.brightness(1 + (step-- * stride));
						},
						repeat:steps
					},
					{
						script:function ()
						{
							self.brightness(1 + (step++ * stride));
						},
						repeat:steps
					}
				]});
			},
			animTurn:function (direction)
			{
				var anim = new Tactics.Animation();

				if (direction === self.direction) return;

				if (direction === board.getRotation(self.direction,180))
				{
					anim.splice
					([
						function ()
						{
							self.drawFrame(data.turns[board.getRotation(self.direction,90)]);
						},
						function ()
						{
							self.drawFrame(data.stills[direction]);
							self.direction = direction;
						}
					]);
				}
				else
				{
					anim.splice(function ()
					{
						self.drawFrame(data.stills[direction]);
						self.direction = direction;
					});
				}

				return anim;
			},
			animDeath:function ()
			{
				var container = new PIXI.Container();
				var anim = Tactics.Animation.fromData(container,Tactics.animations.death);

				container.position = new PIXI.Point(1,-2);

				anim
					.splice(0,
					[
						function ()
						{
							pixi.addChild(container);
						},
						{
							script:function ()
							{
								pixi.children[0].alpha *= 0.60;
								container.alpha *= 0.80;
							},
							repeat:7
						},
						function ()
						{
							if (self.assignment.painted === 'focus') self.assignment.strip();
							board.dropUnit(self);
						}
					])
					.splice(0,
					{
						script:function ()
						{
							$.each(container.children[0].children,function (i,child)
							{
								child.tint = self.color;
							});
						},
						repeat:8
					});

				return anim;
			},
			animLightning:function (target,changes)
			{
				var anim = new Tactics.Animation();
				var pos = target.getCenter();
				var tunit = target.assigned;
				var whiten = [0.30,0.60,0.90,0.60,0.30,0];
				var container = new PIXI.Container();
				var strike;
				var strikes =
				[
					PIXI.Sprite.fromImage('http://www.taorankings.com/html5/images/lightning-1.png'),
					PIXI.Sprite.fromImage('http://www.taorankings.com/html5/images/lightning-2.png'),
					PIXI.Sprite.fromImage('http://www.taorankings.com/html5/images/lightning-3.png'),
					PIXI.Sprite.fromImage('http://www.taorankings.com/html5/images/lightning-1.png'),
					PIXI.Sprite.fromImage('http://www.taorankings.com/html5/images/lightning-2.png'),
					PIXI.Sprite.fromImage('http://www.taorankings.com/html5/images/lightning-3.png')
				];

				container.position = new PIXI.Point(pos.x,pos.y+1);

				strikes[0].position = new PIXI.Point(-38,-532-1);
				strikes[1].position = new PIXI.Point(-38,-532-1);
				strikes[2].position = new PIXI.Point(-40,-532-1);
				strikes[3].position = new PIXI.Point(-35+strikes[3].width,-532-1);
				strikes[3].scale.x = -1;
				strikes[4].position = new PIXI.Point(-35+strikes[4].width,-532-1);
				strikes[4].scale.x = -1;
				strikes[5].position = new PIXI.Point(-33+strikes[5].width,-532-1);
				strikes[5].scale.x = -1;
				strikes.randomize();

				anim.addFrames
				([
					function ()
					{
						sounds.lightning.play();
						Tactics.stage.children[1].addChild(container);
					},
					function () {},
					{
						script:function ()
						{
							if (strike) container.removeChild(strike);
							if (strikes.length)
								strike = container.addChild(strikes.shift());
							else
								Tactics.stage.children[1].removeChild(container);
						},
						repeat:7
					}
				]);

				if (tunit)
				{
					anim
						.splice(2,tunit.animStagger(self,tunit.direction,changes))
						.splice(1,
						[
							function ()
							{
								tunit.change(changes);
							},
							{
								script:function ()
								{
									tunit.whiten(whiten.shift());
								},
								repeat:6
							}
						]);

					if (changes.mHealth === -tunit.health)
						anim.splice(tunit.animDeath(self));
				}

				return anim;
			},
			animHeal:function (targets)
			{
				var anim = new Tactics.Animation();
				var filter = new PIXI.filters.ColorMatrixFilter();
				var matrix = filter.matrix;

				if (!$.isArray(targets)) targets = [targets];

				$.each(targets,function (i,target)
				{
					$.each([{x:-18,y:-52},{x:0,y:-67},{x:18,y:-52}].randomize(),function (i,pos)
					{
						anim.splice(i*3,self.animSparkle(target.pixi,pos));
					});
				});

				anim.splice(0,
				[
					function ()
					{
						$.each(targets,function (i,target)
						{
							target.pixi.children[0].children[1].filters = [filter];
							target.pixi.children[0].children[2].filters = [filter];
						});
					},
					{
						script:function ()
						{
							matrix[3] = matrix[8] += 0.05;
						},
						repeat:5
					},
					{
						script:function ()
						{
							matrix[3] = matrix[8] -= 0.05;
						},
						repeat:5
					},
					function ()
					{
						$.each(targets,function (i,target)
						{
							target.pixi.children[0].children[1].filters = null;
							target.pixi.children[0].children[2].filters = null;
						});
					}
				]);

				return anim;
			},
			animSparkle:function (parent,pos)
			{
				var filter = new PIXI.filters.ColorMatrixFilter();
				var matrix = filter.matrix;
				var shock = PIXI.Sprite.fromImage('http://www.taorankings.com/html5/images/shock.png');
				var size = {w:shock.width,h:shock.height};
				var particle = PIXI.Sprite.fromImage('http://www.taorankings.com/html5/images/particle.png');
				var container = new PIXI.Container();
				container.position = new PIXI.Point(pos.x,pos.y+2);

				shock.filters = [filter];
				container.addChild(shock);

				particle.position = new PIXI.Point(-6.5,-6.5);
				container.addChild(particle);

				return new Tactics.Animation({frames:
				[
					function ()
					{
						matrix[12] = 0.77;
						shock.scale = new PIXI.Point(0.593,0.252);
						shock.position = new PIXI.Point(-shock.width/2,-shock.height/2);
						shock.alpha = 0.22;
						particle.alpha = 0.22;
						parent.addChild(container);
					},
					function ()
					{
						matrix[12] = 0.44;
						shock.scale = new PIXI.Point(0.481,0.430);
						shock.position = new PIXI.Point(-shock.width/2,-shock.height/2 + 3);
						shock.alpha = 0.55;
						particle.position.y += 3;
						particle.alpha = 0.55;
					},
					function ()
					{
						matrix[12] = 0;
						shock.scale = new PIXI.Point(0.333,0.667);
						shock.position = new PIXI.Point(-shock.width/2,-shock.height/2 + 6);
						shock.alpha = 1;
						particle.position.y += 3;
						particle.alpha = 1;
					},
					function ()
					{
						matrix[12] = 0.62;
						shock.scale = new PIXI.Point(0.150,1);
						shock.position = new PIXI.Point(-shock.width/2,-shock.height/2 + 9);
						particle.position.y += 3;
					},
					function ()
					{
						matrix[12] = 1;
						shock.scale = new PIXI.Point(0.133,1.2);
						shock.position = new PIXI.Point(-shock.width/2,-shock.height/2 + 12);
						particle.position.y += 3;
						particle.alpha = 0;
					},
					function ()
					{
						parent.removeChild(container);
					}
				]});
			},
			animCaption:function (caption,options)
			{
				return animText
				(
					caption,
					{font:'bold 11px Arial',stroke:0,strokeThickness:1,fill:'white'},
					options
				);
			}
		});

		function setFilter(name,type)
		{
			var filters = self.filters;
			var base = self.frame.children[1];
			var color = self.frame.children[2];

			if (type)
			{
				if (!(name in filters))
				{
					filters[name] = new PIXI.filters[type]();
					base.filters = color.filters = $.map(filters,function (v) { return v; });
				}
			}
			else
			{
				if (name in filters)
				{
					delete filters[name];

					if (base.filters.length > 1)
					{
						base.filters = color.filters = $.map(filters,function (v) { return v; });
					}
					else
					{
						base.filters = color.filters = null;
					}
				}
			}

			return filters[name];
		}

		function startPulse(steps,speed)
		{
			if (pulse) stopPulse();

			pulse = self.animPulse(steps,speed).play(function ()
			{
				self.brightness(1);
			});

			return self;
		}

		function stopPulse()
		{
			if (!pulse) return self;

			pulse.stop();
			pulse = null;

			return self;
		}

		function highlight(highlight)
		{
			var tile = highlight.tile;
			tile.paint(highlight.action,self.viewed ? 0.15 : 0.3,highlight.color);

			if (!self.viewed)
			{
				tile.action = highlight.action;
				tile.on('select',highlight.select);
				tile.on('focus',highlight.focus);
				tile.on('blur',highlight.blur);
			}

			highlighted.push(highlight);
		}

		function nolight()
		{
			$.each(highlighted,function (i,highlight)
			{
				var tile = highlight.tile;

				if (tile.focused && tile.assigned)
					tile.paint('focus',0.3);
				else
					tile.strip();

				if (tile.action == 'target' && tile.assigned && tile.assigned.activated) tile.assigned.deactivate();
				tile.action = '';
				tile.off('select',highlight.select);
				tile.off('focus',highlight.focus);
				tile.off('blur',highlight.blur);
			});

			highlighted = [];
		}

		function animText(text,style,options)
		{
			var anim = new Tactics.Animation();
			var container = new PIXI.Container();
			var w = 0;

			options = options || {};

			$.each(text.split(''),function (i,v)
			{
				var letter = new PIXI.Text(v,style);
				letter.position.x = w;
				w += letter.width;

				anim.splice(i,[function ()
				{
					container.addChild(letter);
				}]);

				anim.splice(i,animLetter(letter));
			});

			container.position = new PIXI.Point(-((w / 2) | 0),-71);
			container.position.x += options.x || 0;
			container.position.y += options.y || 0;

			anim
				.splice(0,function ()
				{
					pixi.addChild(container);
				})
				.splice(function ()
				{
					pixi.removeChild(container);
				});

			return anim;
		}

		function animLetter(letter)
		{
			return new Tactics.Animation({frames:
			[
				function ()
				{
					letter.position.y -= 7;
				},
				function ()
				{
					letter.position.y -= 2;
				},
				function ()
				{
					letter.position.y += 1;
				},
				function ()
				{
					letter.position.y += 2;
				},
			]});
		}

		return data.extend ? data.extend(self) : self;
	};
})();
