const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();

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

        // Prompt the user to find their location
        res.redirect('/locate?api_key='+user_key);
    }).catch(function(err) {
        res.send("error response: " + JSON.stringify(err));
    });
});

app.get('/locate', function(req, res) {
    res.render('locate');
});

app.listen(8080, function() {
    console.log('Listening on localhost:8080');
});
