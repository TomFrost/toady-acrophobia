/*
 * Acrophobia
 * Toady Module
 * Copyright 2013 Tom Frost
 */

var FaceOff = require('./FaceOff'),
	NormalRound = require('./NormalRound'),
	events = require('events'),
	Seq = require('seq'),
	util = require('util'),
	oUtil = require('./util/Object');

/**
 * The default options for a game of Acrophobia.  Any of these may be
 * overridden by passing new values into the constructor.  The default
 * will be used for anything omitted.
 * @type {{
 *      charPool: string,
 *      faceOffRounds: number,
 *      faceOffMinLetters: number,
 *      pointCap: number,
 *      sayPrivate: Function,
 *      sayPublic: Function,
 *      secsAfterResults: number,
 *      secsBetweenMessages: number,
 *      secsBetweenRounds: number,
 *      secsPerAcroRound: number,
 *      secsPerVoteRound: number,
 *      secsPerFaceOffRound: number,
 *      secsBetweenFaceOffRounds: number,
 *      minLetters: number,
 *      maxLetters: number,
 *      pointsVoteForWinner: number,
 *      pointsFastestWithVote: number,
 *      inputPrefix: string
 * }}
 */
const DEFAULT_OPTS = {
	charPool: 'AAAABBBBCCCCDDDDEEEEEFFFFGGGGHHHHIIIIJJKKLLLLMMMMNNNNOOOPPPPQQRRRSSSSTTTTUVVWWXYZ',
	faceOffRounds: 3,
	faceOffMinLetters: 3,
	pointCap: 30,
	sayPrivate: function() {},
	sayPublic: function() {},
	secsAfterResults: 7,
	secsBetweenMessages: 5,
	secsBetweenRounds: 7,
	secsPerAcroRound: 60,
	secsPerVoteRound: 30,
	secsPerFaceOffRound: 30,
	secsBetweenFaceOffRounds: 2,
	minLetters: 3,
	maxLetters: 7,
	pointsVoteForWinner: 1,
	pointsFastestWithVote: 2,
	inputPrefix: ''
};

/**
 * The AcroGame is the parent class representing an entire, beginning-to-end
 * game of Acrophobia.
 *
 * @param {Object} opts A hash of overrides to {@link #DEFAULT_OPTS}
 * @constructor
 */
var AcroGame = function(opts) {
	var self = this;
	this._handleInput = function() {};
	this._opts = {};
	this._running = false;
	this._ended = false;
	this._scores = {};
	this._userIds = {};
	this._userNames = [];
	oUtil.forEach(DEFAULT_OPTS, function(key, val) {
		self._opts[key] = opts[key] || val;
	});
	this._rawSayPrivate = this._opts.sayPrivate;
	this._rawSayPublic = this._opts.sayPublic;
	this._opts.sayPrivate = this._sayPrivate.bind(this);
	this._opts.sayPublic = this._sayPublic.bind(this);
	this._opts.userNames = this._userNames;
};
util.inherits(AcroGame, events.EventEmitter);

/**
 * Changes the username of an active participant in the Acrophobia game.
 * This allows a user's score to follow username changes.
 *
 * @param {String} oldUser The previous username of the player
 * @param {String} newUser The player's new username
 */
AcroGame.prototype.changeUser = function(oldUser, newUser) {
	if (this._userIds.hasOwnProperty(oldUser)) {
		this._userIds[newUser] = this._userIds[oldUser];
		delete this._userIds[oldUser];
		this._userNames[this._userIds[newUser]] = newUser;
	}
};

/**
 * Deletes a user from this Acrophobia game, removing their score from the
 * scoreboard.  This has no impact once the face-off phase has been reached.
 *
 * @param {String} userName The name of the user to be removed
 */
AcroGame.prototype.deleteUser = function(userName) {
	if (this._userIds.hasOwnProperty(userName)) {
		var id = this._userIds[userName];
		if (this._scores.hasOwnProperty(id))
			delete this._scores[id];
	}
};

/**
 * Starts the Acrophobia game.  This function emits the following event on the
 * AcroGame instance:
 *      - 'start' When the game is successfully started
 *
 * @returns {boolean} true is the game was successfully started; false if the
 *      game had already started before and cannot be re-started.
 */
AcroGame.prototype.start = function() {
	if (!this._running && !this._ended) {
		this._running = true;
		this.emit('start');
		this._runGame();
		return true;
	}
	return false;
};

/**
 * Stops the Acrophobia game.  This function emits the following event on the
 * AcroGame instance:
 *      - 'stop' When the game is successfully stopped.  Arguments are:
 *          - {boolean} false, to denote that the game did not stop naturally
 *
 * @returns {boolean} true is the game was successfully stopped; false if the
 *      game has already ended.
 */
AcroGame.prototype.stop = function() {
	if (!this._ended) {
		this._ended = true;
		this.emit('end', false);
		return true;
	}
	return false;
};

/**
 * Submits user input to the Acrophobia game.
 *
 * @param {String} user The username responsible for the input
 * @param {String} input The string the user sent
 */
AcroGame.prototype.userInput = function(user, input) {
	if (!this._userIds.hasOwnProperty(user)) {
		this._userIds[user] = this._userNames.length;
		this._userNames.push(user);
	}
	this._handleInput(this._userIds[user], input);
};

/**
 * Gets the highest score in the scoreboard.
 *
 * @returns {Number} The highest score currently registered in the game, or 0
 *      if there are no other scores
 * @private
 */
AcroGame.prototype._getTopScore = function() {
	var maxScore = 0;
	oUtil.forEach(this._scores, function(userId, score) {
		if (score > maxScore)
			maxScore = score;
	});
	return maxScore;
};

/**
 * Starts the face-off phase of the game.
 *
 * @param {Number} user1 The userId of the highest scoring player
 * @param {Number} user2 The userId of the second highest-scoring player
 * @param {Function} cb A callback function to be executed whenever the
 *      face-off ends.  Arguments provided are:
 *          - {Error} If an error occurred
 *          - {Number|null} The userId of the face-off winner, or null if
 *            there was an unbreakable tie.
 * @private
 */
AcroGame.prototype._playFaceOff = function(user1, user2, cb) {
	var faceoff = new FaceOff(oUtil.merge(this._opts, {
		players: [user1, user2]
	}));
	this._handleInput = function(userId, msg) {
		faceoff.userInput(userId, msg);
	};
	faceoff.start(cb);
};

/**
 * Plays normal Acrophobia rounds up until the point that the highest-scoring
 * player crosses the threshold defined in the 'pointCap' config item.
 *
 * @param {Number} numLetters The number of letters to start with in the first
 *      acro.  Generally, this should be set to the 'minLetters' config item.
 * @param {Function} cb A callback function to be executed when the normal
 *      rounds have ended, presumably due to the player hitting the point cap
 *      if there was no error.  Arguments provided are:
 *          - {Error} If an error occurred
 * @private
 */
AcroGame.prototype._playToCap = function(numLetters, cb) {
	if (this._ended)
		cb(new Error("Game has been stopped"));
	else {
		var self = this,
			round = new NormalRound(oUtil.merge(this._opts, {
				numLetters: numLetters
			}));
		this._handleInput = function(userId, msg) {
			round.userInput(userId, msg);
		};
		Seq()
			.seq(function playRound() {
				round.start(this);
			})
			.seq(function addPoints(points) {
				oUtil.forEach(points, function(userId, val) {
					if (val) {
						self._scores[userId] = (self._scores[userId] || 0) +
							val;
					}
				});
				this();
			})
			.seq(function showScoreboard() {
				var scoreBoard = '',
					userIds = Object.keys(self._scores).sort(function(a, b) {
						return self._scores[b] - self._scores[a];
					});
				userIds.forEach(function(id) {
					scoreBoard += (scoreBoard ? '[' : ' [') +
						self._userNames[id] + ' ' + self._scores[id] + '] ';
				});
				self._sayPublic("Let's take a look at the scoreboard:");
				self._sayPublic(scoreBoard);
				setTimeout(this, self._opts.secsBetweenMessages * 1000);
			})
			.seq(function nextRound() {
				if (self._getTopScore() >= self._opts.pointCap)
					cb();
				else {
					self._sayPublic("Get ready for the next round!");
					if (++numLetters > self._opts.maxLetters)
						numLetters = self._opts.minLetters;
					setTimeout(self._playToCap.bind(self, numLetters, cb),
						self._opts.secsBetweenRounds * 1000);
				}
			})
			.catch(function(err) {
				cb(err);
			})
	}
};

/**
 * Coordinates the execution of an entire Acrophobia game through the end of
 * the face-off round.
 *
 * @private
 */
AcroGame.prototype._runGame = function() {
	var self = this;
	Seq()
		.seq(function mainGame() {
			self._playToCap(self._opts.minLetters, this);
		})
		.seq(function getTopTwo() {
			var users = Object.keys(self._scores);
			users.sort(function(a, b) {
				return self._scores[b] - self._scores[a];
			});
			this(null, users[0], users[1]);
		})
		.seq(function faceOff(first, second) {
			self._playFaceOff(first, second, this);
		})
		.seq(function complete(winner) {
			if (winner) {
				self._sayPublic(self._userNames[winner] +
					" has won the game! Congratulations!");
				self.emit('win', winner);
				setTimeout(this, self._opts.secsBetweenMessages);
			}
			else
				this();
		})
		.seq(function endGame() {
			self._sayPublic("Thanks for playing!");
			if (!self._ended) {
				self._ended = true;
				self.emit('end', true);
			}
		})
		.catch(function(err) {
			if (!self._ended) {
				self._sayPublic("Game aborted: " + err.message);
				if (!err.hasOwnProperty('code') && err.stack)
					console.log(err.stack);
				self._ended = true;
				self.emit('end', false);
			}
		});
};

/**
 * Sends a private message to an Acrophobia participant by their userId.  This
 * function will have no effect if the Acrophobia game has been stopped.
 *
 * @param {Number} userId The ID of the user to which the message should be
 *      sent
 * @param {String} message The message to be sent
 * @private
 */
AcroGame.prototype._sayPrivate = function(userId, message) {
	if (!this._ended && this._userNames[userId])
		this._rawSayPrivate(this._userNames[userId], message);
};

/**
 * Sends a message to the public channel on which the game is being played.
 * This function will have no effect if the Acrophobia game has been stopped.
 *
 * @param {String} message The message to be sent
 * @private
 */
AcroGame.prototype._sayPublic = function(message) {
	if (!this._ended)
		this._rawSayPublic(message);
};

module.exports = AcroGame;
