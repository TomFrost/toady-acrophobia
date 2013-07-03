/*
 * Acrophobia
 * Toady Module
 * Copyright 2013 Tom Frost
 */

var AcroGame = require('./lib/AcroGame'),
	oUtil = require('./lib/util/Object');

const START_DELAY = 15;

/**
 * Allows games of Acrophobia to be played!  See the acrohelp command for
 * an explanation of gameplay.
 *
 * @param {Object} config A Toady config object
 * @param {Object} client An IRC client object
 * @param {Object} modMan The Toady ModManager object
 * @returns {Object} The Acrophobia Toady mod
 */
module.exports = function(config, client, modMan) {
	var games = {};

	/**
	 * Handles all input to an Acrophobia game.
	 *
	 * @param {String} nick The nick responsible for the input
	 * @param {String} channel The channel of the running game
	 * @param {String} input The provided message array
	 */
	function acroInput(nick, channel, input) {
		if (games[channel] && nickOnChannel(nick, channel))
			games[channel].userInput(nick, input[0]);
	}

	/**
	 * Checks to see if a given nick is currently present on a given channel.
	 *
	 * @param {String} nick The nick to check for
	 * @param {String} channel The channel to be checked
	 * @returns {boolean} true if the nick is on the channel; false otherwise
	 */
	function nickOnChannel(nick, channel) {
		return client.chanData(channel).users[nick] !== undefined;
	}

	/**
	 * Sends an explanation of Acrophobia gameplay to a user.
	 *
	 * @param {String} nick The nick to which the help page should be sent
	 */
	function sendHelp(nick) {
		var help = modMan.getMod('help');
		var lines = [
			"***** Start Acrophobia Help *****",
			"When Acrophobia starts, I will give the channel an acronym -- \
for example, EMC.  Each player ",
			"then gets {secsPerAcroRound} seconds in which to send me a \
phrase that fits the acronym.  You might say \"Eat ",
			"more chicken!\".",
			" ",
			"After {secsPerAcroRound} seconds, I'll post a list of the \
submissions. Each one will have a number.  You vote ",
			"for your favorite by sending me the number of the one you like \
most -- it can't be your own!",
			" ",
			"You get {pointsFastestWithVote} points for being the fastest \
answer to get a vote, {pointsVoteForWinner} point for voting for the winning ",
			"answer, and 1 point for each vote your answer receives. The \
winner gets a bonus point for",
			"every letter in the acronym.",
			" ",
			"When the first person hits {pointCap} points, the face-off round \
starts to determine the winner!",
			" ",
			"All acro answers and votes should be sent to me like this:",
			"/msg " + client.nick + " acro #channel YOUR ENTRY HERE",
			"Where \"#channel\" is the name of the channel in which the game \
is running.",
			"***** End Acrophobia Help *****"
		];
		help.sendHelp(nick, lines, config);
	}

	/**
	 * Starts a new game of Acrophobia on a given channel
	 *
	 * @param {String} replyTo The nick or channel to which error or success
	 *      messages should be sent
	 * @param {String} channel The channel on which to start the new game
	 */
	function startGame(replyTo, channel) {
		if (games[channel]) {
			client.notice(replyTo, "An Acrophobia game is already running on "
				+ channel);
		}
		else {
			var inputPrefix = '/msg ' + client.nick + ' acro ' + channel + ' ';
			games[channel] = new AcroGame(oUtil.merge(config, {
				sayPrivate: function(user, msg) {
					client.notice(user, msg);
				},
				sayPublic: function(msg) {
					client.notice(channel, msg);
				},
				inputPrefix: inputPrefix
			}));
			games[channel].on('end', function() {
				delete games[channel];
			});
			client.notice(channel, "Acrophobia starts in " + START_DELAY +
				" seconds! /msg " + client.nick +
				" acrohelp for instructions.");
			client.notice(channel, "Copy this to your clipboard: [" +
				inputPrefix + "].");
			setTimeout(function() {
				games[channel].start();
			}, START_DELAY * 1000);
		}
	}

	/**
	 * Halts all currently executing Acrophobia games
	 */
	function stopAll() {
		for (var channel in games) {
			if (games.hasOwnProperty(channel))
				stopGame(channel, channel);
		}
	}

	/**
	 * Stops a currently executing Acrophobia game
	 *
	 * @param {String} replyTo The nick or channel to which error or success
	 *      messages should be sent
	 * @param {String} channel The channel on which the game is running
	 */
	function stopGame(replyTo, channel) {
		if (!games[channel])
			client.notice(replyTo, "Acrophobia isn't running in " + channel);
		else {
			games[channel].stop();
			delete games[channel];
			client.notice(replyTo, "Acrophobia stopped for " + channel);
		}
	}

	/**
	 * Listens for nick changes and informs any applicable Acrophobia games
	 *
	 * @param {String} oldNick The user's old nick
	 * @param {String} newNick The user's new nick
	 * @param {Array} channels An array of channels on which the user is
	 *      currently present
	 */
	function nickHandler(oldNick, newNick, channels) {
		channels.forEach(function(channel) {
			if (games[channel])
				games[channel].changeUser(oldNick, newNick);
		});
	}
	client.on('nick', nickHandler);

	/**
	 * Listens for users to leave a channel and removes them from the
	 * running Acrophobia game in that channel, if there is one.
	 *
	 * @param {String} channel The channel from which the user departed
	 * @param {String} nick The nickname of the user
	 */
	function partHandler(channel, nick) {
		if (games[channel])
			games[channel].deleteUser(nick);
	}
	client.on('part', partHandler);
	client.on('kick', partHandler);

	/**
	 * Listens for a user to quit from IRC, and removes them from all
	 * running Acrophobia games.
	 *
	 * @param {String} nick The nick of the user who left
	 * @param {String} reason (unused)
	 * @param {Array} channels An array of channels on which the user was
	 *      present before quitting
	 */
	function quitHandler(nick, reason, channels) {
		channels.forEach(function(channel) {
			if (games[channel])
				games[channel].deleteUser(nick);
		});
	}
	client.on('quit', quitHandler);

	return {
		name: 'Acrophobia',
		commands: {
			acro: {
				handler: function(from, to, target, args) {
					if (to != client.nick)
						client.notice(to, "The acro command must be sent as \
a private message");
					else
						acroInput(from, target, args);
				},
				desc: "Submits a phrase or vote for a running acrophobia game",
				help: [
					"Format: {cmd} <#channel> <submission>",
					"** This command must be messages privately **",
					"Examples:",
					"  /msg {nick} {cmd} #someRoom Fish Tastes Like Chicken!",
					"  /msg {nick} {cmd} #someRoom 5"
				],
				hidden: true,
				targetChannel: true
			},
			acrohelp: {
				handler: function(from, to, target, args) {
					sendHelp(from);
				},
				desc: "Provides instructions on how to play Acrophobia",
				help: [
					"Format: {cmd}",
					"Examples:",
					"  /msg {nick} {cmd}",
					"  {!}{cmd}"
				]
			},
			acrostart: {
				handler: function(from, to, target, args) {
					var inChan = false;
					if (to[0] == '#' || to[0] == '&')
						inChan = true;
					var replyTo = inChan ? to : from;
					startGame(replyTo, target);
				},
				desc: "Starts a game of Acrophobia",
				help: [
					"Format: {cmd} [#channel]",
					"Examples:",
					"  /msg {nick} {cmd} #room",
					"  {!}{cmd}",
					" ",
					"If this is said in a channel with no other channel \
specified, I'll start the game in that channel."
				],
				minPermission: '%',
				targetChannel: true
			},
			acrostop: {
				handler: function(from, to, target, args) {
					var inChan = false;
					if (to[0] == '#' || to[0] == '&')
						inChan = true;
					var replyTo = inChan ? to : from;
					stopGame(replyTo, target);
				},
				desc: "Stops a running game of Acrophobia",
				help: [
					"Format: {cmd} [#channel]",
					"Examples:",
					"  /msg {nick} {cmd} #room",
					"  {!}{cmd}",
					" ",
					"If this is said in a channel with no other channel \
specified, I'll stop the game running in the current channel."
				],
				minPermission: '%',
				targetChannel: true
			}
		},
		configItems: {
			minLetters: {
				desc: "The minimum number of letters per acro",
				type: 'number',
				validate: function(val) {
					if (val < 2 || val > 12)
						return new Error("Value must be between 2 and 12.");
					if (config.maxLetters < val) {
						return new Error(
							"Value cannot be greater than maxLetters.");
					}
					return true;
				}
			},
			maxLetters: {
				desc: "The maximum number of letters per acro",
				type: 'number',
				validate: function(val) {
					if (val < 4 || val > 24)
						return new Error("Value must be between 4 and 24.");
					if (config.minLetters > val) {
						return new Error(
							"Value cannot be less than minLetters.");
					}
					return true;
				}
			},
			pointCap: {
				desc: "Number of points to be reached before entering face-off",
				type: 'number',
				validate: function(val) {
					if (val < 1)
						return new Error("Value must be a positive number.");
					if (val > 500)
						return new Error("Value cannot exceed 500.");
					return true;
				}
			}
		},
		unload: function() {
			stopAll();
			client.removeListener('nick', nickHandler);
			client.removeListener('part', partHandler);
			client.removeListener('kick', partHandler);
			client.removeListener('quit', quitHandler);
		}
	};
};

module.exports.configDefaults = {
	charPool: 'AAAABBBBCCCCDDDDEEEEEFFFFGGGGHHHHIIIIJJKKLLLLMMMMNNNNOOOPPPPQQRRRSSSSTTTTUVVWWXYYZ',
	faceOffMinLetters: 3,
	faceOffRounds: 3,
	minLetters: 3,
	maxLetters: 7,
	pointCap: 30,
	pointsVoteForWinner: 1,
	pointsFastestWithVote: 2,
	secsAfterResults: 7,
	secsBetweenMessages: 5,
	secsBetweenRounds: 7,
	secsPerAcroRound: 60,
	secsPerVoteRound: 30,
	secsPerFaceOffRound: 30,
	secsBetweenFaceOffRounds: 2
};

module.exports.minToadyVersion = '0.3.0';
