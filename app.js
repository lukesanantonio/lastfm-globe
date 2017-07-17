const express = require('express');
const app = express();

const LastFM = require('./lib/lastfm.js');
const LFM_Globe = require('./lfm-globe-secret.js');

app.set('view engine', 'pug');

app.get('/', function (req, res) {
    res.render('index');
});

app.get('/lastfm_cb', function(req, res) {
    const token = req.query.token;
    var lfm = new LastFM(
        LFM_Globe.API_KEY, LFM_Globe.API_SECRET
    );
    lfm.auth_getSession(token).then(function(obj) {
        const user_key = obj.session.key;
        const user_name = obj.session.name;

        // Okay, we've authenticated
        res.send("Success, " + user_name + ", your key is " + user_key);
    }).catch(function(err) {
        res.send("error response: " + JSON.stringify(err));
    });
});

app.listen(8080, function() {
    console.log('Listening on localhost:8080');
});
