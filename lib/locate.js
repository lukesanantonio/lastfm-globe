const LastFMGlobe = require("./lfg");

document.addEventListener('DOMContentLoaded', function() {
    var lfg = new LastFMGlobe.Viewer('cesiumContainer');

    const url_params = new URLSearchParams(window.location.search);
    lfg.start_user_location_wizard(
        url_params.get('username'), url_params.get('token')
    );
});