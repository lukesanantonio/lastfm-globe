const LastFMGlobe = require("./lfg");

document.addEventListener('DOMContentLoaded', function() {
    var lfg = new LastFMGlobe.Viewer('cesiumContainer');
    lfg.enable_viewer();
});