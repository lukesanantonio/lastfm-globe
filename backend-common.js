/*
 * Copyright (C) 2017 Luke San Antonio Bialecki
 * All rights reserved.

 * Released under the BSD 2-clause license.
 */

const LastFM = require('./lib/lastfm.js');

exports = module.exports = {};

// This queue is for user's that are actively listening so we should query
// their recent tracks often.
exports.PRIORITY_USER_QUEUE = "priority-users";
// These users are not currently listening but may start sometime soon.
exports.REGULAR_USER_QUEUE = "regular-users";

exports.userHash = function(username) {
    // Index by username!!
    return "usr:"+username;
};

// Process the return value of user.getRecentTracks!!
exports.unstupify_recent_tracks = function(res) {
    res = res || {};
    var recentTracks = res.recenttracks || {};

    var tracks = [];
    for(var i = 0; i < recentTracks.track.length; ++i) {
        const track = recentTracks.track[i];

        // Get track info
        const song = LastFM.get_text(track, "name");
        const artist = LastFM.get_text(track, "artist");
        const album = LastFM.get_text(track, "album");
        const nowPlaying = LastFM.get_text(track, "nowplaying") || false;

        // Add to list
        tracks.push({song, artist, album, nowPlaying});
    }
    return tracks;
};

exports.make_user_recent_track_info = function(track) {
    return {
        recentSong: track.song,
        recentAlbum: track.album,
        recentArtist: track.artist,
        recentNowPlaying: track.nowPlaying
    };
};
