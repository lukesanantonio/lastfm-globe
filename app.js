const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const redis = require('redis');

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

app.set('view engine', 'pug');

app.use('/static', express.static(path.join(__dirname + '/static')));
app.use('/public', express.static(path.join(__dirname + '/public')));

app.use(bodyParser.json());

app.get('/', function (req, res) {
    res.render('index');
});

app.get('/lastfm_cb', function(req, res) {
    const token = req.query.token;

    lfm.auth_getSession(token).then(function(obj) {
        // Okay, we've authenticated
        const user_key = obj.session.key;

        // Record their API (session) key (this won't expire).
        // Use position as the value, eventually. Using a post request

        // Technically we don't need their key to figure out what track they
        // are currently listening to. However, if we just asked for
        // username, any random person could assign location to a any user.

        // How SADD, we lost a key!!
        // Actually we just don't know its location yet. This is used to mark
        // a key as unplaced so that we can have a public API that sets
        // actual position of the user who the key belongs to. We won't allow
        // reassigning location of key, so this makes it pretty safe. Someone
        // won't know the key to use to reposition, etc.
        rclient.sadd('lfg-lost-keys', user_key);

        // Prompt the user to find their location
        res.redirect('/locate?api_key='+user_key);
    }).catch(function(err) {
        res.send("error response: " + JSON.stringify(err));
    });
});

function user_hash(username) {
    // Index by username!!
    return "usr:"+username;
}

async function recordUserInfo(sk) {
    // Make a request to the LastFM API and add user information to a
    // separate hash / struct thing.
    var userInfo = await lfm.user_getInfo({sk: sk}) || {};
    userInfo = userInfo.user || {};

    // Get the username
    const username = userInfo.name;
    if(!username) {
        throw "Failed to retrieve user information. Bad key?";
    }

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
    rclient.hmsetAsync(user_hash(username),
        "username", username,
        "realname", userInfo.realname,
        "sk", sk,
        "recentSong", song,
        "recentArtist", artist,
        "recentAlbum", album,
        "recentNowPlaying", nowPlaying
    );

    if(nowPlaying) {
        // Put this user on a priority queue to be processed.

        // If they are currently listening it means they will probably continue
        // to listen, and we should query their information more frequently.

        // Remember,a user should only be in one queue at a time.
        rclient.lpushAsync("priority-users", username);
    } else {
        rclient.lpushAsync("regular-users", username);
    }
}

app.post('/set_key_location', async (req, res) => {
    var key = req.body.key;
    var long = req.body.longitude;
    var lat = req.body.latitude;

    try {
        // While doing all the geo stuff, record user info in the background.
        recordUserInfo(key);

        var numKeysRemoved = await rclient.sremAsync('lfg-lost-keys', key);

        if(numKeysRemoved >= 1) {
            // Okay, attach geolocation to key
            var numKeysLocated = await rclient.geoaddAsync('lfg-geo', long, lat, key);

            if(numKeysLocated == 1) {
                // All good
                res.send("Success");
            } else {
                res.status(422).send("Bad location");
            }
        } else {
            // Rip, we can't do anything with this key
            res.status(422).send("Old key");
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
