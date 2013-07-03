/*
 * Acrophobia
 * Toady Module
 * Copyright 2013 Tom Frost
 */

// Dependencies
var Seq = require('seq'),
	FaceOffRound = require('./FaceOffRound'),
	events = require('events'),
	util = require('util'),
	oUtil = require('./util/Object');

/**
 * The FaceOff class coordinates the execution of the face-off phase of an
 * Acrophobia game, running rounds with disjointed acro submission and voting
 * phases, while filling awkward conversation gaps with explanation as to how
 * the face-off works.
 *
 * @param {Object} opts An object mapping options keys to values for
 *      the FaceOff.  For a listing of these options and their defaults, see
 *      AcroGame::DEFAULT_OPTS.
 * @constructor
 */
var FaceOff = function(opts) {
	var self = this;
	this._opts = opts;
	this._scores = {};
	this._fastest = {};
	this._fastestRounds = [];
	this._playerHash = {};
	opts.players.forEach(function(userId) {
		self._playerHash[userId] = true;
		self._scores[userId] = 0;
		self._fastest[userId] = 0;
	});
	this._curAcroRound = null;
	this._curVoteRound = null;
	this._voteQueue = [];
	this._completedVotes = 0;
	this._voteRunning = false;
	this._votingStarted = false;
	this._rounds = [];
	for (var i = 0; i < opts.faceOffRounds; i++) {
		this._rounds.push(new FaceOffRound(oUtil.merge(opts, {
			numLetters: opts.faceOffMinLetters + i
		})));
	}
};
util.inherits(FaceOff, events.EventEmitter);

/**
 * Runs the face-off phase of an Acrophobia game.
 *
 * @param {Function} cb A callback function to be called when the face-off
 *      phase is completed.  Arguments provided are:
 *          - {Error} If an error occurred
 *          - {Number|null} The userId of the winner, or null if the face-off
 *            resulted in an unbreakable tie.
 */
FaceOff.prototype.start = function(cb) {
	this.on('voteComplete', this._announceWinner.bind(this, cb));
	var self = this,
		pub = this._opts.sayPublic,
		p1 = this._opts.userNames[this._opts.players[0]],
		p2 = this._opts.userNames[this._opts.players[1]];
	Seq()
		.seq(function introduce() {
			pub("Our top player has reached the " + self._opts.pointCap +
				" point mark!  It's time for the face-off round. " + p1 +
				" and " + p2 +
				", please switch to your private messages to continue.");
			setTimeout(this, self._opts.secsBetweenMessages * 1000);
		})
		.seq(function instruct() {
			self._sayPlayers("Welcome to the face-off! I'll be running " +
				self._opts.faceOffRounds + " speed-rounds sent directly to " +
				"you. Answer by saying " + self._opts.inputPrefix +
				"ANSWER HERE. Get ready!");
			self._explainFaceOff(p1, p2);
			setTimeout(this, self._opts.secsBetweenMessages * 1000);
		})
		.set(this._rounds)
		.seqEach(function playEachRound(round) {
			var next = this;
			self._curAcroRound = round;
			round.startAcro(function() {
				self._addVoteRound(round);
				setTimeout(next, self._opts.secsBetweenFaceOffRounds * 1000);
			});
		})
		.seq(function finish() {
			self._sayPlayers("That's a wrap! Head back to the main channel \
for the results.");
		});
};

/**
 * Submits any user input to the appropriate FaceOffRound during the course
 * of the face-off phase.  This function determines whether the user is a
 * player in the face-off, and if so, assumes the input is a phrase submission.
 * All other messages are interpreted as votes.
 *
 * @param {Number} userId The userId responsible for the input
 * @param {String} msg The submitted text
 */
FaceOff.prototype.userInput = function(userId, msg) {
	if (this._playerHash[userId]) {
		if (this._curAcroRound)
			this._curAcroRound.submitPhrase(userId, msg);
	}
	else {
		if (this._curVoteRound)
			this._curVoteRound.submitVote(userId, msg);
	}
};

/**
 * Adds a round to the queue of rounds ready for the voting phase to begin.
 * If no round is currently in a voting phase, the voting process will
 * immediately start for that round.
 *
 * @param {FaceOffRound} round The completed acro round ready for voting
 * @private
 */
FaceOff.prototype._addVoteRound = function(round) {
	this._voteQueue.push(round);
	if (!this._voteRunning)
		this._startVoteRound();
};

/**
 * Determines and announces the winner of the face-off phase.
 *
 * @param {Function} cb A callback function to be executed after the winner
 *      has been announced.  Arguments provided are:
 *          - {Error} If an error occurred
 *          - {Number|null} The userId of the winner, or null if there was
 *            an unbreakable tie.
 * @private
 */
FaceOff.prototype._announceWinner = function(cb) {
	var self = this,
		pub = this._opts.sayPublic;
	Seq()
		.seq(function showScores() {
			var players = Object.keys(self._scores).sort(function(a, b) {
				return self._scores[b] - self._scores[a];
			});
			var winner = self._scores[players[0]] != self._scores[players[1]] ?
				players[0] : null;
			var scores = "Final results:";
			players.forEach(function(userId) {
				scores += ' [' + self._opts.userNames[userId] + ' ' +
					self._scores[userId] + ']';
			});
			pub(scores);
			var next = winner ? cb.bind(this, null, winner) : this;
			setTimeout(next, self._opts.secsBetweenMessages);
		})
		.seq(function showTie() {
			pub("We have a tie! The winner will be decided by who answered \
the fastest.");
			setTimeout(this, self._opts.secsBetweenMessages);
		})
		.seq(function showFastest() {
			self._showFastestRounds(0, this);
		})
		.seq(function showWinner(winner) {
			if (winner === null) {
				pub("Well, that didn't help much!  Let's just call it a tie.");
				setTimeout(cb, self._opts.secsBetweenMessages);
			}
			else
				cb(null, winner);
		});
};

/**
 * Fills the public channel gap created by the first round face-off submissions
 * with a brief explanation of what happens during the face off, and the
 * importance of voting.  If this happens to take longer than it takes for the
 * first face-off submissions to complete, this explanation will be cut short.
 *
 * @param {String} p1 The username (not ID) of the highest ranking face-off
 *      player
 * @param {String} p2 The username (not ID) of the second-highest ranking
 *      face-off player
 * @private
 */
FaceOff.prototype._explainFaceOff = function(p1, p2) {
	var msgs = [
		"At the end of each game, the top two players go head-to-head in " +
			this._opts.faceOffRounds + " speed rounds.",
		p1 + " and " + p2 + " will have " + this._opts.secsPerFaceOffRound +
			" seconds to answer each acro. Then everyone here will have the " +
			"chance to vote for their favorites!",
		"Votes are the ONLY points that these players get in the face-off, " +
			"so remember to get yours in!",
		"Once all the votes are tallied up, I'll announce our winner.  Get " +
			"ready for the first round of voting!"
	];
	this._sayGapFiller(msgs);
};

/**
 * Tabulates the player that answered fastest the majority of the time in all
 * completed face-off rounds.
 *
 * @returns {Number|null} The userId who answered fastest most often, or null
 *      if both players had an equal number of fast answers
 * @private
 */
FaceOff.prototype._getFastestPlayer = function() {
	var self = this,
		fastOrder = Object.keys(this._fastest).sort(function(a, b) {
			return self._fastest[b] - self._fastest[a];
		});
	if (fastOrder[0] == fastOrder[1])
		return null;
	else
		return fastOrder[0];
};

/**
 * Sends a message privately to FaceOff players.
 *
 * @param {String} msg The message to be sent
 * @private
 */
FaceOff.prototype._sayPlayers = function(msg) {
	var self = this;
	this._opts.players.forEach(function(userId) {
		self._opts.sayPrivate(userId, msg);
	});
};

/**
 * Sends an array of messages to the public channel, one message at a time,
 * separated by the time configured in the 'secsBetweenMessages' config option.
 * If voting starts on a face-off round before these messages complete, the
 * remaining messages will be canceled.
 *
 * @param {Array} msgs An array of messages to send to the public channel
 * @private
 */
FaceOff.prototype._sayGapFiller = function(msgs) {
	if (msgs.length && !this._votingStarted) {
		this._opts.sayPublic(msgs.shift());
		setTimeout(this._sayGapFiller.bind(this, msgs),
			this._opts.secsBetweenMessages * 1000);
	}
};

/**
 * Lists the user that answered the fastest in each round, on the public
 * channel.
 *
 * @param {Number} roundIdx the 0-indexed round number to start with.  Mostly
 *      used to support recursion; this should generally always be 0 when
 *      called from another function.
 * @param {Function} cb A callback function to be executed when the results
 *      have been shown.  Arguments to this function are:
 *          - {Error} If an error occurred
 *          - {Number|null} The userId of the overall fastest player, or null
 *            if the two players tied.
 * @private
 */
FaceOff.prototype._showFastestRounds = function(roundIdx, cb) {
	if (roundIdx >= this._fastestRounds.length)
		cb(null, this._getFastestPlayer());
	else {
		if (this._fastestRounds[roundIdx] === null) {
			this._opts.sayPublic("Round " + (roundIdx + 1) +
				": Neither player submitted.")
		}
		else {
			this._opts.sayPublic("Round " + (roundIdx + 1) + ": " +
				this._opts.userNames[this._fastestRounds[roundIdx]] +
				" answered first.");
		}
		setTimeout(this._showFastestRounds.bind(this, roundIdx + 1, cb),
			this._opts.secsBetweenMessages / 2);
	}
};

/**
 * Starts the voting process for the face-off rounds.  This function will
 * pull a round from the head of the vote queue and run the full vote
 * process.  If another round has entered the queue by the time it finishes,
 * that round will immediately start the voting phase.  Otherwise, this
 * function will exit and must be called again manually whenever a round is
 * added to the vote queue.
 * @private
 */
FaceOff.prototype._startVoteRound = function() {
	var self = this;
	this._curVoteRound = this._voteQueue.shift();
	this._voteRunning = true;
	this._votingStarted = true;
	this._curVoteRound.startVote(function(err, points, fastest) {
		oUtil.forEach(points, function(userId, score) {
			self._scores[userId] += score;
		});
		self._fastestRounds.push(fastest);
		if (fastest !== null)
			self._fastest[fastest]++;
		self._voteRunning = false;
		if (++self._completedVotes == self._opts.faceOffRounds)
			self.emit('voteComplete', self._completedVotes);
		else if (self._voteQueue.length)
			self._startVoteRound();
	});
};

module.exports = FaceOff;
