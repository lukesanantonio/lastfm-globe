/*
 * Copyright (C) 2017 Luke San Antonio Bialecki
 * All rights reserved.
 */

const md5 = require('md5');
const request = require('request');

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

// Returns a promise to the response
function lastfm_request_auth_get(api_key, method, params, secret) {
    // Do not include the format param in the message signature.
    const format = params.format;
    delete params.format;

    // Generate a method signature
    const sig = method_signature(api_key, method, params, secret);

    // Use JSON format, add other parameters
    params.format = format || 'json';
    params = add_required_parameters(api_key, method, params);

    // Add signature
    params.api_sig = sig;

    // Wrap the request in a promise.
    return new Promise(function(resolve, reject) {
        request(
            {
                uri: LAST_FM_ROOT + '/?' + build_query_string(params),
                json: true,
            },
            function(err, res, body) {
                if(body.hasOwnProperty('error')) {
                    reject(body);
                } else {
                    resolve(body);
                }
            }
        );
    });

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

module.exports = LastFM;