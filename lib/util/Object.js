/*
 * Acrophobia
 * Toady Module
 * Copyright 2013 Tom Frost
 */

/**
 * Executes a given function once for every key/value pair in the object.  Note
 * that hasOwnProperty will be checked for each key before calling.
 *
 * @param {Object} obj The object to be iterated through
 * @param {Function} cb The callback function to be executed for each key/value
 *      pair.  Arguments provided are:
 *          - {String} The key
 *          - {*} The value
 */
function forEach(obj, cb) {
	for (var key in obj) {
		if (obj.hasOwnProperty(key))
			cb(key, obj[key])
	}
}

/**
 * Performs a shallow merge of all object arguments.
 *
 * @return {Object} The completed, merged object.
 */
function merge() {
	var obj = {};
	var args = Array.prototype.slice.call(arguments);
	args.forEach(function(elem) {
		if (typeof elem == 'object') {
			for (var i in elem) {
				if (elem.hasOwnProperty(i))
					obj[i] = elem[i];
			}
		}
	});
	return obj;
}

module.exports = {
	forEach: forEach,
	merge: merge
};
