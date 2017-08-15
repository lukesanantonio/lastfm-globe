const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const redis = require('redis');
const crypto = require('crypto');

const bluebird = require('bluebird');
bluebird.promisifyAll(redis.RedisClient.prototype);
bluebird.promisifyAll(redis.Multi.prototype);

const app = express();
var rclient = redis.createClient();

const LastFM = require('./lib/lastfm.js');
const LFM_Globe = require('./lfm-globe-secret.js');
var lfm = new LastFM(
    LFM_Globe.API_KEY, LFM_Globe.API_SECRET
);
DEGREES_PER_KILOMETER = 111.325;

function InvalidMovementTokenError() {
    this.message = "Invalid / old token";
}

// This queue is for user's that are actively listening so we should query
// their recent tracks often.
const PRIORITY_USER_QUEUE = "priority-users";
// These users are not currently listening but may start sometime soon.
const REGULAR_USER_QUEUE = "regular-users";

function userHash(username) {
    // Index by username!!
    return "usr:"+username;
}
function userChangeLocationToken(username) {
    return "usr-token:" + username;
}
function createChangeLocationToken() {
    return crypto.randomBytes(64).toString("hex");
}

async function requestUserInfoWithKey(sk) {
    // Make a request to the LastFM API and add user information to a
    // separate hash / struct thing.
    var userInfo = await lfm.user_getInfo({sk: sk}) || {};
    userInfo = userInfo.user || {};

    // Get the username
    const username = userInfo.name;
    if(!username) {
        throw "Failed to retrieve user information. Bad key?";
    }

    // TODO: If we can't get the user's recent tracks for whatever reason,
    // just exclude that from the returned object, maybe, or add a flag to
    // see if it's required, etc.

    // Get the user's recent tracks
    var recentTracks = await lfm.user_getRecentTracks({
        user: username
    }) || {};
    recentTracks = recentTracks.recenttracks || {};

    // Get the first track
    const track = recentTracks.track[0];
    // Get track info
    const song = LastFM.get_text(track, "name");
    const artist = LastFM.get_text(track, "artist");
    const album = LastFM.get_text(track, "album");
    const nowPlaying = LastFM.get_text(track, "nowplaying") || false;

    // Add user information and current song information for later query.
    var userInfoObj = {
        username: username,
        realname: userInfo.realname,
        sk: sk,
        recentSong: song,
        recentArtist: artist,
        recentAlbum: album,
        recentNowPlaying: nowPlaying
    };

    // Return user information
    return userInfoObj;
}

function getCachedUserInfoWithUsername(username) {
    return rclient.hgetallAsync(userHash(username));
}

async function setUserInfo(userInfoObj) {
    const username = userInfoObj.username;

    rclient.hmsetAsync(userHash(username), userInfoObj);

    // Remember, a user should only be in one queue at a time.

    // Remove the user from any and all processing queues.

    await Promise.all([
        rclient.lremAsync(REGULAR_USER_QUEUE, 0, username),
        rclient.lremAsync(PRIORITY_USER_QUEUE, 0, username)
    ]);

    if(userInfoObj.recentNowPlaying) {
        // Put this user on a priority queue to be processed.

        // If they are currently listening it means they will probably continue
        // to listen, and we should query their information more frequently.
        rclient.lpushAsync(PRIORITY_USER_QUEUE, username);
    } else {
        // Don't worry about these guys.
        rclient.lpushAsync(REGULAR_USER_QUEUE, username);
    }
}

app.set('view engine', 'pug');

app.use('/static', express.static(path.join(__dirname + '/static')));
app.use('/public', express.static(path.join(__dirname + '/public')));

app.use(bodyParser.json());

app.get('/', function (req, res) {
    res.render('index');
});

// Technically we don't need their key to figure out what track they are
// currently listening to. However, if we just asked for username, any
// random person could assign location to a any user.
app.get('/lastfm_cb', function(req, res) {
    const token = req.query.token;

    lfm.auth_getSession(token).then(async (obj) => {
        // Okay, we've authenticated
        const user_key = obj.session.key;

        // Request user info
        var userInfoPromise = requestUserInfoWithKey(user_key);

        // Record user info asynchronously.
        userInfoPromise.then(async (info) => {
            await setUserInfo(info);
        });

        var userInfo = await userInfoPromise;

        // Generate a new movement token for this user and pass it to the
        // client-side wizard with a query parameter.
        var token = createChangeLocationToken();

        // Mark it down so that the user can redeem it, at most, an hour later.
        // This will overwrite any existing token!!
        rclient.setexAsync(
            userChangeLocationToken(userInfo.username), 3600, token
        );

        // Prompt the user to find their location
        res.redirect('/locate?username='+userInfo.username+'&token='+token);
    }).catch(function(err) {
        res.send("error response: " + JSON.stringify(err));
    });
});

app.post('/set_user_location', async (req, res) => {
    var username = req.body.username;
    var token = req.body.token;
    var long = req.body.longitude;
    var lat = req.body.latitude;

    try {
        var cachedToken = await rclient.getAsync(userChangeLocationToken(username));
        if(cachedToken === token) {
            // Okay, we can move this user
            var numRemoved = await rclient.delAsync(
                userChangeLocationToken(username)
            );

            if(numRemoved !== 1) {
                // Bah, something else just used up the token, oh well.
                throw new InvalidMovementTokenError();
            }

            // Wait for the user info to come in
            var userInfo = await getCachedUserInfoWithUsername(username);

            // Set new user location or update existing user location.
            await rclient.geoaddAsync(
                'lfg-geo', long, lat, userInfo.username
            );

            // All good
            res.send("Success");
        } else {
            // Rip, we can't do anything with this key
            throw new InvalidMovementTokenError();
        }
    } catch(err) {
        res.status(422).send(err);
    }

});

app.get('/globe', async (req, res) => {
    // Retrieve keys by location. Filter out by zoom level and other factors.

    // Here's an idea.
    // At large zoom levels, sample a few points scattered around the entire
    // area of focus, then make many queries of smaller radii with a high limit
    // on the number of results.

    // At small zoom levels use the actual point of focus with a radis. Do this
    // first unless it becomes too large.

    var lat = req.query.latitude;
    var long = req.query.longitude;
    var zoom = req.query.zoom;

    var results_radius = (360.0 / Math.pow(2.0, zoom)) * DEGREES_PER_KILOMETER;

    var users = await rclient.georadiusAsync(
        "lfg-geo", long, lat, results_radius, "km", "WITHCOORD"
    );

    var promises = [];
    for (let i = 0; i < users.length; ++i) {
        // For each user, asynchronously grab their user information and pair
        // it with their location.
        promises.push(new Promise(async (resolve, reject) => {
            const user = users[i];

            // Query user information by key
            var user_obj = await rclient.hgetallAsync("sk:" + user[0]) || {};
            user_obj.key = user[0];

            resolve({
                "user": user_obj,
                "longitude": parseFloat(user[1][0]),
                "latitude": parseFloat(user[1][1]),
            });
        }));
    }

    // Collect values
    var ret = await Promise.all(promises);

    res.set('Content-Type', 'application/json');
    res.send(JSON.stringify(ret));
});

app.get('/locate', function(req, res) {
    res.render('locate');
});

app.get('/view', function(req, res) {
    res.render('view');
})
app.listen(8080, function() {
    console.log('Listening on localhost:8080');
});
