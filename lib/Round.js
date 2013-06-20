/*
 * Acrophobia
 * Toady Module
 * Copyright 2013 Tom Frost
 */

// Dependencies
var Seq = require('seq'),
	util = require('util'),
	events = require('events'),
	oUtil = require('./util/Object');

const PHASE_STOPPED = 0;
const PHASE_ACRO = 1;
const PHASE_VOTE = 2;

/**
 * The Round object is responsible for playing through a single round
 * of acrophobia, abstracting out all player/channel communication so that
 * rounds can be executed in both standard and face-off forms.
 *
 * @param {Object} opts An object mapping options keys to values for
 *      Round.  For a listing of these options and their defaults, see
 *      AcroGame::DEFAULT_OPTS.
 * @constructor
 */
var Round = function(opts) {
	this._opts = opts;
	this._acro = this._makeAcro();
	this._phase = PHASE_STOPPED;
	this._phrases = {};
	this._submitTimes = {};
	this._userOrder = [];
	this._votes = {};
};
util.inherits(Round, events.EventEmitter);

/**
 * Begins the phrase submission phase, limited to the specified number of
 * seconds.
 *
 * This function emits the following events on the Round:
 *      - 'acroStart' When phrase submissions are opened.  Arguments are:
 *          - {String} The acronym, in all caps, that submissions must match
 *      - 'acroCountdown' When a milestone is reached in the time limit, such
 *        as the halfway point, 10 seconds remaining, 3 remaining, and so on.
 *        Arguments are:
 *          - {Number} The number of seconds remaining
 *      - 'acroEnd' When the voting window has closed.  Arguments are:
 *          - {Array} The randomized order of the phrases.  Votes should be
 *            submitted for the chosen index + 1 (this allows the phrases to
 *            start with 1 instead of 0, since this is being presented to
 *            human players). The value of the array element is the userId
 *            responsible for submitting the answer.
 *          - {Object} A mapping of userIds to submitted phrases.
 *
 * @param {Number} timeLimit The number of seconds for which the phrase
 *      submission window should be kept open.
 */
Round.prototype.startAcro = function(timeLimit) {
	if (this._phase == PHASE_STOPPED) {
		var self = this;
		this._phase = PHASE_ACRO;
		this.emit('acroStart', self._acro);
		this._countdown(timeLimit, 'acroCountdown', function() {
			self._phase = PHASE_STOPPED;
			self._userOrder = shuffle(Object.keys(self._phrases));
			self.emit('acroEnd', self._userOrder, self._phrases);
		});
	}
};

/**
 * Begins the voting phase, limited to the specified number of seconds.
 *
 * This function emits the following events on the Round:
 *      - 'voteStart' When the voting is opened.  Arguments are:
 *          - {Array} The randomized order of the phrases.  Votes should be
 *            submitted for the chosen index + 1 (this allows the phrases to
 *            start with 1 instead of 0, since this is being presented to
 *            human players). The value of the array element is the userId
 *            responsible for submitting the answer.
 *          - {Object} A mapping of userIds to submitted phrases.
 *      - 'voteCountdown' When a milestone is reached in the time limit, such
 *        as the halfway point, 10 seconds remaining, 3 remaining, and so on.
 *        Arguments are:
 *          - {Number} The number of seconds remaining
 *      - 'voteEnd' When the voting window has closed.  Arguments are:
 *          - {Object} The results object, as returned by {@link #_getResults}
 *
 * @param {Number} timeLimit The number of seconds for which the voting
 *      window should be kept open.
 */
Round.prototype.startVote = function(timeLimit) {
	if (this._phase == PHASE_STOPPED) {
		var self = this;
		this._phase = PHASE_VOTE;
		this.emit('voteStart', this._userOrder, this._phrases);
		this._countdown(timeLimit, 'voteCountdown', function() {
			this._phase = PHASE_STOPPED;
			self.emit('voteEnd', self._getResults());
		});
	}
};

/**
 * Handles phrase submissions during the acro phase of the round.
 *
 * @param {Number} userId The user ID of the submitting player
 * @param {String} phrase A message input from the player, which, if formatted
 *      properly, should match the acronym chosen for this round
 */
Round.prototype.submitPhrase = function(userId, phrase) {
	if (this._phase == PHASE_ACRO) {
		var acro = '',
			words = phrase
				.toUpperCase()
				.replace(/[^A-Z0-9'\-]/g, ' ')
				.replace(/\s+/g, ' ')
				.replace(/(?:^\s|\s$)/g, '')
				.split(' ');
		words.forEach(function(word) {
			acro += word[0];
		});
		if (acro == this._acro) {
			var first = !this._phrases[userId];
			this._phrases[userId] = phrase.replace(/(?:^\s|\s$)/g, '');
			this._submitTimes[userId] = new Date().getTime();
			this.emit('phraseAccepted', userId, first);
		}
		else
			this.emit('phraseRejected', userId, acro);
	}
};

/**
 * Handles user submissions during the voting phase of the round.
 *
 * @param {Number} userId The ID of the user submitting the vote
 * @param {String} voteStr A message which, if properly formatted, should
 *      contain the number of their chosen phrase.
 */
Round.prototype.submitVote = function(userId, voteStr) {
	if (this._phase == PHASE_VOTE) {
		var vote = parseInt(voteStr) - 1;
		if (vote >= 0 && vote < this._userOrder.length) {
			if (userId != this._userOrder[vote]) {
				var first = !this._votes[userId];
				this._votes[userId] = this._userOrder[vote];
				this.emit('voteAccepted', userId, first);
			}
			else
				this.emit('voteRejected', userId, 'self');
		}
		else
			this.emit('voteRejected', userId, 'invalid');
	}
};

/**
 * Waits the specified number of seconds, emitting major time milestones such
 * as the halfway point, 10, 3, 2, and 1 seconds when those milestones are
 * reached.
 *
 * @param {Number} secs The total number of seconds to wait
 * @param {String} eventName The name of the event to be fired on each
 *      countdown tick.  This event will be fired with one argument:
 *          - {Number} The number of seconds remaining in the countdown
 * @param {Function} cb A callback function to be called after 'secs' seconds.
 *      No arguments will be passed to this function.
 * @private
 */
Round.prototype._countdown = function(secs, eventName, cb) {
	var half = Math.floor(secs / 2),
		milestones = [1, 2, 3];
	if (half > 15)
		milestones.push(10);
	milestones.push(half);
	this._emitMilestones(eventName, secs, milestones, cb);
};

/**
 * Emits each countdown milestone when reached.
 *
 * @param {String} eventName The name of the event to be omitted.  This event
 *      will be fired with one argument:
 *          - {Number} The number of seconds remaining in the countdown
 * @param {Number} last The last milestone, or the total number of seconds
 *      to start with.
 * @param {Array} milestones An array of numbers defining the second markers
 *      at which the time should be announced.  These MUST be passed in
 *      ascending order.  For example, if given [1, 5, 10], this function will
 *      alert the public when 10 seconds are remaining, then 5 seconds, then 1.
 * @param {Function} cb A callback function to be executed when the timer has
 *      run out.
 * @private
 */
Round.prototype._emitMilestones = function(eventName, last, milestones, cb) {
	if (!milestones.length)
		setTimeout(cb, last * 1000);
	else {
		var cur = milestones.pop(),
			diff = last - cur,
			self = this;
		setTimeout(function() {
			self.emit(eventName, cur);
			self._emitMilestones(eventName, cur, milestones, cb);
		}, diff * 1000);
	}
};

/**
 * Calculates the results of this round.  Results are returned in the following
 * object:
 *
 *      {
 *          winner: {Number|null} The userId that won the round, or null if
 *              there were no votes
 *          tie: {Array|null} If a tie occurred, this array contains the
 *              userIds of the tied players. In this case, winner is
 *              chosen by who submitted the fastest answer.  This is null
 *              if there was no tie.
 *          fastest: {Number|null} The userId that submitted the fastest answer
 *              overall, or null if there were no submissions
 *          fastestWithVote: {Number|null} The userId that submitted the
 *              fastest answer to earn a vote, or null if there were no
 *              submissions or no votes
 *          topVoters: {Array} The userIds that voted for the
 *              winning answer.
 *          nonVoters: {Array} The userIds that submitted a phrase but
 *              didn't vote this round.
 *          acroVotes: {Object} mapping userId to the number of votes
 *              their submitted acro got.
 *      }
 *
 * @returns {{
 *      winner: number|null,
 *      tie: Array|null,
 *      fastest: number|null,
 *      fastestWithVote: number|null
 *      topVoters: Array,
 *      nonVoters: Array,
 *      acroVotes: {}
 *      }|null} The results as described if votes were placed; null if no one
 *             voted.
 * @private
 */
Round.prototype._getResults = function() {
	var self = this,
		usersToVoteCount = {},
		usersToVoters = {},
		firstSubmitTimeWithVote = Infinity,
		fastestWithVote = null,
		firstSubmitTime = Infinity,
		fastest = null,
		nonVoters = [];
	oUtil.forEach(this._votes, function(userId, votedFor) {
		if (!usersToVoteCount.hasOwnProperty(votedFor)) {
			usersToVoteCount[votedFor] = 0;
			usersToVoters[votedFor] = [];
		}
		usersToVoteCount[votedFor]++;
		if (!usersToVoters[votedFor])
			usersToVoters[votedFor] = [];
		usersToVoters[votedFor].push(userId);
	});
	Object.keys(this._phrases).forEach(function(userId) {
		if (!self._votes.hasOwnProperty(userId))
			nonVoters.push(userId);
		if (self._submitTimes[userId] < firstSubmitTime) {
			firstSubmitTime = self._submitTimes[userId];
			fastest = userId;
		}
		if (self._submitTimes[userId] < firstSubmitTimeWithVote &&
				usersToVoteCount[userId]) {
			firstSubmitTimeWithVote = self._submitTimes[userId];
			fastestWithVote = userId;
		}
	});
	var voteOrder = Object.keys(usersToVoteCount).sort(function(a, b) {
		if (usersToVoteCount[b] == usersToVoteCount[a])
			return self._submitTimes[a] - self._submitTimes[b];
		return usersToVoteCount[b] - usersToVoteCount[a];
	});
	var winner = voteOrder[0] || null,
		tie = [],
		curScore = usersToVoteCount[winner],
		i = 0;
	while (voteOrder.length && usersToVoteCount[voteOrder[i]] == curScore)
		tie.push(voteOrder[i++]);
	return {
		winner: winner,
		tie: tie.length > 1 ? tie : null,
		fastest: fastest,
		fastestWithVote: fastestWithVote,
		topVoters: winner ? usersToVoters[winner] : [],
		nonVoters: nonVoters,
		acroVotes: usersToVoteCount
	};
};

/**
 * Generates an acronym, in all caps, with the number of letters defined in
 * this round's options.
 *
 * @returns {String} An acronym appropriate for this round's options
 * @private
 */
Round.prototype._makeAcro = function() {
	var str = '';
	while (str.length < this._opts.numLetters)
		str += this._opts.charPool[rand(0, this._opts.charPool.length - 1)];
	return str;
};

/**
 * Returns a random integer between a min and a max, inclusive.
 *
 * @param {Number} min The minimum value for the range
 * @param {Number} max The maximum value for the range
 * @returns {Number} A random number in the given range
 */
function rand(min, max) {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Shuffles an array using the Fisher-Yates algorithm.  The given array itself
 * will be shuffled in place, so simply calling this function without capturing
 * the return value is sufficient to shuffle an array's elements.  Return
 * value is supplied for convenience.
 *
 * @param {Array} ary An array to be shuffled.
 * @returns {Array} The same array given, which has been shuffled
 */
function shuffle(ary) {
	var i = ary.length,
		rnd, temp;
	if (i > 1) {
		while (--i) {
			rnd = Math.floor(Math.random() * (i + 1));
			temp = ary[i];
			ary[i] = ary[rnd];
			ary[rnd] = temp;
		}
	}
	return ary;
}

module.exports = Round;
