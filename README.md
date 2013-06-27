#Acrophobia: The Fear of Acronyms
A Toady mod that can run Acrophobia games on multiple channels simultaneously.

##Install
Install into a [Toady](https://github.com/TomFrost/Toady) instance with:

    ./ribbit install acrophobia

or right inside of IRC with:

	!ribbit install acrophobia

Then view the commands with:

	!viewmod acrophobia

##Gameplay
The game starts with the bot providing a random acronym to the room, such as
"BBS".  The population of the room is then invited to submit phrases that would
match that acronym.  For the next minute, players submit things like "Bulletin
Board System" and "Bluth Banana Stand".

Once the time limit is up, each user's submission is shown next to a number.
The channel is invited to vote for their favorite submission, and points are
awarded based on the winning answer, who answered fastest, and who voted for
the winning answer.

This process repeats, with a varying number of letters in the acronym, until
the first player hits 30 points.  At that time, the top two players on the
scoreboard enter the Face-Off round.  In the face-off, the players are given 3
acronyms and 30 seconds to answer each through private messages.  As they
answer, the rest of the room votes to determine the overall winner of the game.

##Config options
Acrophobia runs great with default settings right out of the box, but can be
tweaked heavily.  To do so, open your server's .yaml file from Toady's config
folder, and add the following section with any settings you'd like to override.
The values given below are the defaults.

	mod_acrophobia:
	  # The pool of characters from which to pull letters when creating
	  # acronyms.  The more a letter appears, the more likely it will be to
	  # get chosen.  Note that all letters MUST be uppercase.
	  charPool: AAAABBBBCCCCDDDDEEEEEFFFFGGGGHHHHIIIIJJKKLLLLMMMMNNNNOOOPPPPQQRRRSSSSTTTTUVVWWXYYZ
	  # The number of letters at which to start the first face-off round
      faceOffMinLetters: 3
      # The number of rounds within the face-off phase of the game
      faceOffRounds: 3
      # The minimum number of letters for acros in a normal round
      minLetters: 3
      # The maximum number of letters for acros in a normal round
      maxLetters: 7
      # The number of points to be reached before face-off starts
      pointCap: 30
      # The number of points awarded for voting for the winning answer
      pointsVoteForWinner: 1
      # The number of points awarded for being the fastest answer that earned
      # a vote
      pointsFastestWithVote: 2
      # The number of seconds to wait after voting results are shown
      secsAfterResults: 7
      # The number of seconds to wait between game messages from the bot
      secsBetweenMessages: 5
      # The number of seconds to wait between normal game rounds
      secsBetweenRounds: 7
      # The number of seconds to allow for answering acros in normal rounds
      secsPerAcroRound: 60
      # The number of seconds to allow for voting in normal rounds
      secsPerVoteRound: 30
      # The number of seconds to allow for answering acros and voting in
      # a face-off round
      secsPerFaceOffRound: 30
      # The number of seconds to wait between face-off rounds
      secsBetweenFaceOffRounds: 2

Using the new Config module added to Toady 0.3.0, some config options can now
be changed on the fly.  Owners and SuperUsers can now type
`!viewmod acrophobia` to see a listing of these options.

##Credits
Acrophobia for Toady was written by Tom Frost in 2013.
