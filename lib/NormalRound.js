/*
 * Acrophobia
 * Toady Module
 * Copyright 2013 Tom Frost
 */

// Dependencies
var Seq = require('seq'),
	oUtil = require('./util/Object'),
	Round = require('./Round');

/**
 * Indicates that the round is not currently accepting or reacting to user
 * input.
 * @type {number}
 */
const INPUTMODE_OFF = 0;

/**
 * Indicates that all user input will be considered a phrase submission.
 * @type {number}
 */
const INPUTMODE_ACRO = 1;

/**
 * Indicates that all user input will be considered a vote submission.
 * @type {number}
 */
const INPUTMODE_VOTE = 2;

/**
 * The NormalRound object is responsible for playing through a single round
 * of Acrophobia during the standard phase as players work up to the point cap.
 *
 * @param {Object} opts An object mapping options keys to values for
 *      NormalRound.  For a listing of these options and their defaults, see
 *      AcroGame::DEFAULT_OPTS.
 * @constructor
 */
var NormalRound = function(opts) {
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
NormalRound.prototype.ERR_NUM_SUBMISSIONS = 1;

/**
 * An error code indicating that no votes were submitted and the round could
 * not be completed
 * @type {number}
 */
NormalRound.prototype.ERR_NO_VOTES = 2;

/**
 * Starts the round.
 *
 * @param {Function} cb A callback function to be executed when the round
 *      completes.  Arguments provided are:
 *          - {Error} An error object if the round was forced to complete
 *            prematurely.  The two most common cases will have a 'code'
 *            property on the error object, set to one of the following
 *            values:
 *              - {@link ERR_NUM_SUBMISSIONS} if the round cannot complete
 *                because not enough players submitted an acro phrase
 *              - {@link ERR_NO_VOTES} if the round cannot complete because
 *                no one voted for an answer
 *          - {Object} A mapping of user IDs to the number of points they
 *            earned during this round
 */
NormalRound.prototype.start = function(cb) {
	var self = this,
		pub = this._opts.sayPublic,
		priv = this._opts.sayPrivate;
	this._round.on('acroStart', function(acro) {
		self._acro = acro;
		pub("This round's acro is [ " + acro + " ]. Submissions are open for "
			+ self._opts.secsPerAcroRound + " seconds!");
		pub("Submit a phrase to match this acro by typing: " +
			self._opts.inputPrefix + 'YOUR PHRASE HERE');
		self._inputMode = INPUTMODE_ACRO;
	});
	this._round.on('acroEnd', function(userOrder, userPhrases) {
		pub("Submissions are now closed!");
		self._phrases = userPhrases;
		self._inputMode = INPUTMODE_OFF;
		if (userOrder.length > 1) {
			setTimeout(function() {
				pub("Here are this round's submissions:");
				userOrder.forEach(function(user, idx) {
					pub((idx + 1) + (idx < 10 ? ' ' : '') + ' | ' +
						userPhrases[user]);
				});
				pub("Voting is open for " + self._opts.secsPerVoteRound +
					" seconds. YOU MUST VOTE TO RECEIVE POINTS! " +
					"Submit votes by typing: " + self._opts.inputPrefix +
					"NUMBER");
				self._inputMode = INPUTMODE_VOTE;
				self._round.startVote(self._opts.secsPerVoteRound);
			}, self._opts.secsBetweenMessages * 1000);
		}
		else {
			var err = new Error('Not enough players!');
			err.code = self.ERR_NUM_SUBMISSIONS;
			cb(err);
		}
	});
	this._round.on('voteEnd', function(results) {
		self._inputMode = INPUTMODE_OFF;
		if (results.winner) {
			self._showResults(results, function() {
				cb(null, self._getPoints(results));
			});
		}
		else {
			var err = new Error('No one voted!');
			err.code = self.ERR_NO_VOTES;
			cb(err);
		}
	});
	this._round.on('phraseAccepted', function(userId, first) {
		pub(self._opts.userNames[userId] + ' ' +
			(first ? '' : "re-") + "submitted.");
		priv(userId, "Phrase accepted!");
	});
	this._round.on('phraseRejected', function(userId, acro) {
		priv(userId, "Your phrase has the acronym [" + acro +
			"] which does not match this round's acro: [" + self._acro + "].");
	});
	this._round.on('voteAccepted', function(userId, first) {
		pub(self._opts.userNames[userId] + ' ' +
			(first ? '' : "re-") + "voted.");
		priv(userId, "Vote accepted!");
	});
	this._round.on('voteRejected', function(userId, reason) {
		switch(reason) {
			case 'self':
				priv(userId, "You can't vote for yourself. That's lame.");
				break;
			default:
				priv(userId, "That's an invalid vote! Vote using the format: "
					+ self._opts.inputPrefix + "NUMBER (where NUMBER is the " +
					"number of the phrase you're voting for).");
				break;
		}
	});
	this._round.on('acroCountdown', this._announceMilestone.bind(this));
	this._round.on('voteCountdown', this._announceMilestone.bind(this));
	this._round.startAcro(self._opts.secsPerAcroRound);
};

/**
 * Informs the round of user input.  This function will determine which
 * handler to use for the message, given the current phase of the round.
 *
 * @param {Number} userId The ID of the user submitting the message.
 * @param {String} msg The user's message
 */
NormalRound.prototype.userInput = function(userId, msg) {
	switch(this._inputMode) {
		case INPUTMODE_ACRO:
			this._round.submitPhrase(userId, msg);
			break;
		case INPUTMODE_VOTE:
			this._round.submitVote(userId, msg);
			break;
	}
};

/**
 * Announces a countdown milestone when reached.
 *
 * @param {Number} secs The number of seconds remaining in the countdown
 * @private
 */
NormalRound.prototype._announceMilestone = function(secs) {
	this._opts.sayPublic(secs + (secs > 9 ? ' seconds left!' : '!'));
};

/**
 * Calculates the final points for this round, given the voting results.
 *
 * @param {Object} res The voting results for this round, as returned by
 *      Round::_getResults (provided in the voteEnd event).
 * @returns {Object} A hash of user IDs to the number of points they earned by
 *      the end of this round
 * @private
 */
NormalRound.prototype._getPoints = function(res) {
	var self = this,
		points = {};
	oUtil.forEach(res.acroVotes, function(userId, votes) {
		points[userId] = votes;
	});
	points[res.fastestWithVote] += this._opts.pointsFastestWithVote;
	points[res.winner] += this._opts.numLetters;
	res.topVoters.forEach(function(voter) {
		points[voter] = (points[voter] || 0) + self._opts.pointsVoteForWinner;
	});
	res.nonVoters.forEach(function(nonVoter) {
		if (points[nonVoter])
			points[nonVoter] = 0;
	});
	return points;
};

/**
 * Shows the points that have been awarded to players during this round,
 * configurable to only show certain types of point bonuses.  Messages will be
 * paced according to the wait times specified in this round's options.
 *
 * @param {Array} types An array of strings, defining which bonus types to
 *      show and in which order they should be shown.  Available values are:
 *      ['tie', 'winner', 'fastest', 'topVoters', 'nonVoters']
 * @param {Object} res A result set, as returned by {@link #_getResults}
 * @param {Function} cb A callback function to be executed after all point
 *      bonuses have been shown.  No arguments will be passed to this function.
 * @private
 */
NormalRound.prototype._showPoints = function(types, res, cb) {
	var self = this,
		names = [];
	if (!types.length)
		cb();
	else {
		var type = types.pop(),
			pub = this._opts.sayPublic;
		switch (type) {
			case 'tie':
				res.tie.forEach(function(uid) {
					names.push(self._opts.userNames[uid]);
				});
				pub("We have a tie! The winner will be chosen by which of \
these players answered the fastest: " + names.join(', '));
				break;
			case 'winner':
				pub(this._opts.userNames[res.winner] + " wins the round! A " +
					this._opts.numLetters +
					" point bonus will be awarded to this player.");
				break;
			case 'fastest':
				pub(this._opts.userNames[res.fastestWithVote] +
					" submitted the fastest answer to receive a vote, and \
earns " + this._opts.pointsFastestWithVote + " " +
					plural(this._opts.pointsFastestWithVote, "point") + ".");
				break;
			case 'topVoters':
				res.topVoters.forEach(function(uid) {
					names.push(self._opts.userNames[uid]);
				});
				pub("The following users voted for the winning answer, and \
will each receive " + this._opts.pointsVoteForWinner + ' ' +
					plural(this._opts.pointsVoteForWinner, "point") + ': ' +
					names.join(', '));
				break;
			case 'nonVoters':
				pub("The following users did not vote, and forfeit their \
points for this round: " + res.nonVoters.join(', '));
				break;
		}
		setTimeout(this._showPoints.bind(this, types, res, cb),
			this._opts.secsBetweenMessages * 1000);
	}
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
NormalRound.prototype._showResults = function(res, cb) {
	var self = this,
		pub = self._opts.sayPublic,
		resTypes = [];
	if (res.tie)
		resTypes.push('tie');
	resTypes.push('winner');
	if (self._opts.pointsFastestWithVote)
		resTypes.push('fastest');
	if (self._opts.pointsVoteForWinner)
		resTypes.push('topVoters');
	if (res.nonVoters.length)
		resTypes.push('nonVoters');
	resTypes.reverse();
	var phraseOrder = Object.keys(this._phrases).sort(function(a, b) {
		return (res.acroVotes[b] || 0) - (res.acroVotes[a] || 0);
	});
	Seq()
		.seq(function preVoteResults() {
			pub("Here's who submitted the answers, and how many votes they \
got!");
			this();
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
			setTimeout(this, self._opts.secsAfterResults * 1000);
		})
		.seq(function pointResults() {
			self._showPoints(resTypes, res, cb);
		});
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

module.exports = NormalRound;
