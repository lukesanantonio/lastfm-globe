const express = require('express');
const app = express();

app.set('view engine', 'pug');

app.get('/', function (req, res) {
    res.render('index');
});

app.listen(8080, function() {
    console.log('Listening on localhost:8080');
});
