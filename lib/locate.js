const LastFMGlobe = require("./lfg");

document.addEventListener('DOMContentLoaded', function() {
    var lfg = new LastFMGlobe.Viewer('cesiumContainer');

    const url_params = new URLSearchParams(window.location.search);
    const session_key = url_params.get('api_key');
    lfg.set_user_session_key(session_key);
    lfg.start_user_location_wizard();
});