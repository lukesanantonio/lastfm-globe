const process = require('process');

const redis = require('redis');
const bluebird = require('bluebird');
bluebird.promisifyAll(redis.RedisClient.prototype);
bluebird.promisifyAll(redis.Multi.prototype);

var rclient = redis.createClient();

const LastFM = require('./lib/lastfm.js');
const lfg_secret = require('./lfm-globe-secret.js');

var lfmclient = new LastFM(lfg_secret.API_KEY, lfg_secret.API_SECRET);

const common = require('./backend-common.js');

const DELAY = 500;

var run = true;
var done1 = false;
var done2 = false;
function make_worker(queue, delay, done) {
    return async function _worker_fn() {
        // Get the next user in the queue.
        // Starts at the left, ends at the right.
        var username = await rclient.blpopAsync(queue, 0);

        // Be kind to the LastFM servers and wait for the server to finish
        // before doing another user.

        // Right now I don't think this will stop setInterval from calling the
        // function again. So look into this.

        // What was the user's most recent song?
        var mostRecentTrack = common.unstupify_recent_tracks(
            await lfmclient.user_getRecentTracks({user: username})
        )[0] || {};

        // Update user info accordingly.
        var trackInfo = common.make_user_recent_track_info(mostRecentTrack);
        rclient.hmsetAsync(common.userHash(username), trackInfo);

        if(mostRecentTrack.nowPlaying) {
            // They are currently listening, add them to the priority queue.
            await rclient.rpushAsync(common.PRIORITY_USER_QUEUE, username);
        }
        else {
            // Not listening - use the low-priority queue.
            await rclient.rpushAsync(common.REGULAR_USER_QUEUE, username);
        }

        // Call the next function with the given delay if
        if(run) {
            setTimeout(_worker_fn, delay);
        } else {
            // We can't just terminate the worker because a user could be
            // lost between the top and bottom!!!
            done = true;
        }
    };
}

const priority_worker = make_worker(common.PRIORITY_USER_QUEUE, 500, done1);
const regular_worker = make_worker(common.REGULAR_USER_QUEUE, 500, done2);

priority_worker();
regular_worker();

process.on('SIGINT', function() {
    // Wait for both workers to be done.
    run = false;

    while(!done1 || !done2) {
        // TODO: Find a less janky way to shutdown gracefully.
    }

    process.exit(0);
});