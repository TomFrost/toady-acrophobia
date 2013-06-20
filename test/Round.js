/*
 * Acrophobia
 * Toady Module
 * Copyright 2013 Tom Frost
 */

var should = require('should'),
	Round = require('../lib/Round');

function getRound() {
	var round = new Round({
		userNames: ['A', 'B', 'C', 'D']
	});
	round._phrases[0] = 'A phrase';
	round._phrases[1] = 'B phrase';
	round._phrases[2] = 'C phrase';
	round._phrases[3] = 'D phrase';
	round._phrases[4] = 'E phrase';
	round._submitTimes[0] = 2;
	round._submitTimes[1] = 1;
	round._submitTimes[2] = 3;
	round._submitTimes[3] = 4;
	round._submitTimes[4] = 5;
	round._votes[0] = 3;
	round._votes[1] = 3;
	round._votes[2] = 4;
	round._votes[3] = 4;
	return round;
}

describe('Round', function() {
	it('should accurately calculate results', function() {
		var round = getRound(),
			res = round._getResults();
		res.should.have.property('winner');
		res.should.have.property('tie');
		res.should.have.property('fastest');
		res.should.have.property('fastestWithVote');
		res.should.have.property('topVoters');
		res.should.have.property('nonVoters');
		res.should.have.property('acroVotes');
		res.winner.should.eql('3');
		res.tie.should.include('3');
		res.tie.should.include('4');
		res.fastest.should.eql('1');
		res.fastestWithVote.should.eql('3');
		res.topVoters.should.include('0');
		res.topVoters.should.include('1');
		res.nonVoters.should.include('4');
		res.acroVotes.should.eql({'3': 2, '4': 2});
	});
	it('should handle results when no one played', function() {
		var round = new Round({}),
			res = round._getResults();
		should.not.exist(res.winner);
	})
});