/*
 * Copyright (C) 2017 Luke San Antonio Bialecki
 * All rights reserved.
 */

const md5 = require('md5');
const request = require('request');

function LastFMError(msg) {
    this.msg = msg;
    return this;
}

function method_signature(api_key, method, params, secret) {
    // Sort parameters alphabetically
    var sorted_keys = Object.keys(params).sort();
    var param_str = "";
    for(var i = 0; i < sorted_keys.length; ++i) {
        // What is the name of this parameter?
        var key = sorted_keys[i];
        // Append key name, then the value
        param_str += key + params[key];
    }
    return md5('api_key' + api_key + 'method' + method + param_str + secret);
}

function add_required_parameters(api_key, method, params) {
    return {api_key, method, ...params}
}

function build_query_string(params) {
    var str = "";
    var keys = Object.keys(params);
    for(var i = 0; i < keys.length; ++i) {
        str += keys[i] + '=' + params[keys[i]];
        if(i < keys.length - 1) {
            str += '&';
        }
    }
    return str;
}

const LAST_FM_ROOT = 'http://ws.audioscrobbler.com/2.0/';

function lastfm_request_get(api_key, method, params) {
    params = params || {};
    params.format = params.format || "json";

    // If we are using json, parse it right away for the user.
    var useJson = false;
    if(params.format === "json") {
        useJson = true;
    }

    // Add api_key and method to parameter list.
    params = add_required_parameters(api_key, method, params);

    // Wrap the request in a promise.
    return new Promise(function(resolve, reject) {
        request(
            {
                uri: LAST_FM_ROOT + '/?' + build_query_string(params),
                json: useJson,
            },
            function(err, res, body) {
                if(body.hasOwnProperty('error')) {
                    body.params = params;
                    reject(body);
                } else {
                    resolve(body);
                }
            }
        );
    });
}

// Returns a promise to the response
function lastfm_request_auth_get(api_key, method, orig_params, secret) {
    // Do not include the format or callback parameter in the message signature.
    var params = Object.assign({}, orig_params);
    delete params.format;
    delete params.callback;

    // Generate a method signature
    const sig = method_signature(api_key, method, params, secret);

    // Add back format and callback parameters
    Object.assign(params, orig_params);

    // Add signature
    params.api_sig = sig;

    // Make the request
    return lastfm_request_get(api_key, method, params)
}

// Init the LastFM class
function LastFM(api_key, secret) {
    this.api_key = api_key;
    this.secret = secret;
}

LastFM.prototype.auth_getSession = function(token) {
    return lastfm_request_auth_get(
        this.api_key, 'auth.getSession', {token}, this.secret
    );
};
LastFM.prototype.user_getInfo = function(options) {
    if(options.hasOwnProperty('username')) {
        // Use the username with no authentication
        throw new LastFMError("user.getInfo with username is NYI");
    } else if(options.hasOwnProperty('sk')) {
        // Use the session key to find the authenticated user's information.
        return lastfm_request_auth_get(
            this.api_key, 'user.getInfo', {sk: options.sk}, this.secret
        )
    } else {
        throw new LastFMError("Must include username or session key");
    }
};
LastFM.prototype.user_getRecentTracks = function(params) {
    return lastfm_request_get(this.api_key, 'user.getRecentTracks', params);
};

module.exports = LastFM;