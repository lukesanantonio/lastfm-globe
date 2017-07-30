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

app.set('view engine', 'pug');

app.use('/static', express.static(path.join(__dirname + '/static')));
app.use('/public', express.static(path.join(__dirname + '/public')));

app.use(bodyParser.json());

app.get('/', function (req, res) {
    res.render('index');
});

app.get('/lastfm_cb', function(req, res) {
    const token = req.query.token;
    var lfm = new LastFM(
        LFM_Globe.API_KEY, LFM_Globe.API_SECRET
    );
    lfm.auth_getSession(token).then(function(obj) {
        // Okay, we've authenticated
        const user_key = obj.session.key;

        // Record their API (session) key (this won't expire).
        // Use position as the value, eventually. Using a post request

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

app.post('/set_key_location', async (req, res) => {
    var key = req.body.key;
    var long = req.body.longitude;
    var lat = req.body.latitude;

    try {
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

app.get('/locate', function(req, res) {
    res.render('locate');
});

app.listen(8080, function() {
    console.log('Listening on localhost:8080');
});
