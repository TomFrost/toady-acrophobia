/*
 * Acrophobia
 * Toady Module
 * Copyright 2013 Tom Frost
 */

// Dependencies
var Seq = require('seq'),
	Round = require('./Round');

/**
 * Indicates that the round is not currently accepting or reacting to user
 * input.
 * @type {number}
 */
const INPUTMODE_OFF = 0;

/**
 * Indicates that only phrase submissions will be accepted.
 * @type {number}
 */
const INPUTMODE_ACRO = 1;

/**
 * Indicates that only vote submissions will be accepted.
 * @type {number}
 */
const INPUTMODE_VOTE = 2;

/**
 * The FaceOffRound object is responsible for playing through a single face-off
 * round, allowing the phrase submissions to be disjointed from the voting
 * process.
 *
 * @param {Object} opts An object mapping options keys to values for
 *      FaceOffRound.  For a listing of these options and their defaults, see
 *      AcroGame::DEFAULT_OPTS.
 * @constructor
 */
var FaceOffRound = function(opts) {
	this._opts = opts;
	this._inputMode = INPUTMODE_OFF;
	this._round = new Round(opts);
	this._acro = '';
	this._phrases = {};
};

/**
 * An error code indicating that there were not enough phrase submissions to
 * complete the round
 * @type {number}
 */
FaceOffRound.prototype.ERR_NUM_SUBMISSIONS = 1;

/**
 * An error code indicating that no votes were submitted and the round could
 * not be completed
 * @type {number}
 */
FaceOffRound.prototype.ERR_NO_VOTES = 2;

/**
 * Starts the round.
 *
 * @param {Function} cb A callback function to be executed when the round
 *      completes.  There are no arguments for this function.
 */
FaceOffRound.prototype.startAcro = function(cb) {
	var self = this,
		priv = this._opts.sayPrivate;
	this._round.on('acroStart', function(acro) {
		self._acro = acro;
		self._sayPlayers("This round's acro is [ " + acro +
			" ]. Submissions are open for " + self._opts.acroSecs +
			" seconds!");
		self._sayPlayers("Submit a phrase to match this acro by typing: " +
			self._opts.inputPrefix + 'YOUR PHRASE HERE');
		self._inputMode = INPUTMODE_ACRO;
	});
	this._round.on('acroEnd', function(userOrder, userPhrases) {
		self._sayPlayers("Submissions are now closed!");
		self._userOrder = userOrder;
		self._phrases = userPhrases;
		self._inputMode = INPUTMODE_OFF;
		cb();
	});
	this._round.on('phraseAccepted', function(userId) {
		priv(userId, "Phrase accepted!");
	});
	this._round.on('phraseRejected', function(userId, acro) {
		priv(userId, "Your phrase has the acronym [" + acro +
			"] which does not match this round's acro: [" + self._acro + "].");
	});
	this._round.on('acroCountdown', this._announceMilestone.bind(this, false));
	this._round.startAcro(self._opts.secsPerFaceOffRound);
};

/**
 * Starts the voting process.
 *
 * @param {Function} cb A callback function to be executed when the voting
 *      process ends.  Arguments provided are:
 *          - {Error} If an error occurred
 *          - {Object} A mapping of userIds to the number of votes received
 *          - {Number|null} The userId responsible for the fastest answer, or
 *            null if no one answered
 */
FaceOffRound.prototype.startVote = function(cb) {
	switch (this._userOrder.length) {
		case 0:
			this._opts.sayPublic("For the acro [ " + this._acro +
				" ], neither player submitted an answer. No points will be " +
				"awarded.");
			setTimeout(cb.bind(this, {}, null),
				this._opts.secsBetweenMessages);
			break;
		case 1:
			this._showSingleResult(this._userOrder[0], cb);
			break;
		default:
			this._runVote(cb);
	}
};

/**
 * Submits an acro answer for the given user.  Note that this function does not
 * check to ensure the submitter if a face-off participant.
 *
 * @param {Number} userId The userId of the submitter
 * @param {String} phrase The answer to be submitted
 */
FaceOffRound.prototype.submitPhrase = function(userId, phrase) {
	if (this._inputMode == INPUTMODE_ACRO)
		this._round.submitPhrase(userId, phrase);
};

/**
 * Submits a vote for the given user.  Note that this function does not check
 * to ensure the voter is not a face-off participant before voting.
 *
 * @param {Number} userId The userId of the voter
 * @param {String} voteStr The vote string.  If formatted properly, this should
 *      contain only the number of the phrase to be voted for.
 */
FaceOffRound.prototype.submitVote = function(userId, voteStr) {
	if (this._inputMode == INPUTMODE_VOTE)
		this._round.submitVote(userId, voteStr);
};

/**
 * Announces a countdown milestone when reached.
 *
 * @param {boolean} isPublic true if this message should be visible to the
 *      public room; false to show it to players privately.
 * @param {Number} secs The number of seconds remaining in the countdown
 * @private
 */
FaceOffRound.prototype._announceMilestone = function(isPublic, secs) {
	var msg = secs + ((secs > 9) ? " seconds left!" : '!');
	if (isPublic)
		this._opts.sayPublic(msg);
	else
		this._sayPlayers(msg);
};

/**
 * Runs the voting phase of the face-off round.
 *
 * @param {Function} cb A callback function to be executed whenever voting
 *      is complete and results are in.  Arguments provided are:
 *          - {Error} If an error occurred
 *          - {Object} A mapping of user IDs to number of votes
 *          - {Number|null} The User ID that submitted the fastest answer, or
 *            null if neither player submitted.
 * @private
 */
FaceOffRound.prototype._runVote = function(cb) {
	var self = this,
		pub = this._opts.sayPublic,
		priv = this._opts.sayPrivate;
	this._inputMode = INPUTMODE_VOTE;
	pub("For the acro [ " + this._acro + " ] our players submitted:");
	pub('1  | ' + this._phrases[this._userOrder[0]]);
	pub('2  | ' + this._phrases[this._userOrder[1]]);
	pub("Voting is open for " + self._opts.secsPerFaceOffRound +
		" seconds. Submit votes by typing: " + self._opts.inputPrefix +
		"NUMBER");
	this._round.on('voteEnd', function(results) {
		self._inputMode = INPUTMODE_OFF;
		self._showResults(results, function() {
			cb(null, results.acroVotes, results.fastest);
		});
	});
	this._round.on('voteAccepted', function(userId, first) {
		pub(self._opts.userNames[userId] + ' ' +
			(first ? '' : "re-") + "voted.");
		priv(userId, "Vote accepted!");
	});
	this._round.on('voteRejected', function(userId) {
		priv(userId, "That's an invalid vote! Vote using the format: "
			+ self._opts.inputPrefix + "NUMBER (where NUMBER is the " +
			"number of the phrase you're voting for).");
	});
	this._round.on('voteCountdown', this._announceMilestone.bind(this, true));
	this._round.startVote(self._opts.secsPerFaceOffRound);
};

/**
 * Sends a message privately to FaceOff players.
 *
 * @param {String} msg The message to be sent
 * @private
 */
FaceOffRound.prototype._sayPlayers = function(msg) {
	var self = this;
	this._opts.players.forEach(function(userId) {
		self._opts.sayPrivate(userId, msg);
	});
};

/**
 * Presents a set of results to the chat room, paced according to the wait
 * times specified in this round's options.
 *
 * @param {Object} res A result set, as returned by {@link #_getResults}
 * @param {Function} cb A callback function to be executed when all results
 *      have been shown.  No arguments will be passed to this function.
 * @private
 */
FaceOffRound.prototype._showResults = function(res, cb) {
	var self = this,
		pub = self._opts.sayPublic,
		phraseOrder = Object.keys(this._phrases).sort(function(a, b) {
			return (res.acroVotes[b] || 0) - (res.acroVotes[a] || 0);
		});
	Seq()
		.seq(function preVoteResults() {
			pub("Here's who submitted the answers, and how many votes they \
got!");
			setTimeout(this, self._opts.secsBetweenMessages * 1000);
		})
		.set(phraseOrder)
		.seqEach(function voteResults(id) {
			var votes = res.acroVotes[id] || 0,
				voteStr = votes + ' ' + plural(votes, 'vote');
			pub('[' + self._opts.userNames[id] + ' | ' + voteStr + '] ' +
				self._phrases[id]);
			this();
		})
		.seq(function resultPause() {
			setTimeout(cb, self._opts.secsAfterResults * 1000);
		});
};

/**
 * Announces a single submission to the chat room.
 *
 * @param {Number} userId The userId of the player responsible for the answer
 * @param {Function} cb A callback function to be executed when the
 *      announcement is complete.  Arguments provided are:
 *          - {Error} If an error occurred
 *          - {Object} A mapping of userId to points earned
 *          - {Number} The given userId
 * @private
 */
FaceOffRound.prototype._showSingleResult = function(userId, cb) {
	var self = this,
		pub = this._opts.sayPublic,
		name = this._opts.userNames[this._userOrder[0]];
	pub("For the acro [ " + this._acro + " ], " + name + " answered: \"" +
		this._phrases[this._userOrder[0]] + "\".");
	setTimeout(function() {
		pub("Since " + name + " was the only player to answer, " +
			self._opts.numLetters + " points will be awarded automatically.");
		var scores = {};
		scores[userId] = self._opts.numLetters;
		cb(null, scores, userId);
	}, this._opts.secsBetweenMessages);
};

/**
 * Adds an 's' to a given word if the provided num is not 1.
 *
 * @param {Number} num A number to decide if the word should be plural
 * @param {String} word A word that can be pluralized by adding 's'
 * @returns {String} The word, with the 's' appended if appropriate
 */
function plural(num, word) {
	return word + (num != 1 ? 's' : '');
}

module.exports = FaceOffRound;
