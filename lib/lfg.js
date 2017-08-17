module.exports = (function() {
    function cartesianFromBrowserGeolocation() {
        const gps_options = {
            enableHighAccuracy: true
        };
        return new Promise(function(resolve, reject) {
            if(!('geolocation' in navigator)) {
                reject("No support for geolocation in browser");
            }
            navigator.geolocation.getCurrentPosition(function(position) {
                resolve(Cesium.Cartesian3.fromDegrees(
                    position.coords.longitude, position.coords.latitude
                ));
            }, function(err) {
                // Show the error
                reject(err);
            }, gps_options);
        });
    }

    function _make_xhr_error(xhr) {
        return {status: xhr.status, message: xhr.responseText};
    }

    function set_key_location(username, token, cartographic_pos) {
        // We expect cartographic_pos to be a value of type Cesium.Cartographic
        // If that's not the case we'll throw an exception right away.
        var data = {
            longitude: Cesium.Math.toDegrees(cartographic_pos.longitude),
            latitude: Cesium.Math.toDegrees(cartographic_pos.latitude),
            username: username,
            token: token,
        };

        return new Promise(function(resolve, reject) {
            var xhr = new XMLHttpRequest();
            xhr.onreadystatechange = function() {
                if(xhr.readyState === XMLHttpRequest.DONE) {
                    if (xhr.status === 200) {
                        // Success
                        resolve();
                    } else {
                        reject(_make_xhr_error(xhr));
                    }
                }
            };
            xhr.open('POST', '/set_user_location', true);
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.send(JSON.stringify(data));
        });
    }
    function get_globe(longitude, latitude, zoom) {
        return new Promise(function(resolve, reject) {
            var xhr = new XMLHttpRequest();
            xhr.onreadystatechange = function() {
                if (xhr.readyState === XMLHttpRequest.DONE) {
                    if (xhr.status === 200) {
                        var res = JSON.parse(xhr.responseText);
                        resolve(res);
                    } else {
                        reject(_make_xhr_error(xhr));
                    }
                }
            };

            // Figure out the user's current location and also attach event listener
            // to camera so we know when to request more!
            xhr.open('GET',
                "/globe?longitude=" + JSON.stringify(longitude) +
                "&latitude=" + JSON.stringify(latitude) + "&zoom=" +
                JSON.stringify(zoom)
            );
            xhr.send();
        });
    }

    function show_prompt(prompt_text, options) {
        var container = document.createElement('div');
        container.className = 'prompt-container';

        var prompt = document.createElement('p');
        prompt.className = 'prompt';
        prompt.innerText = prompt_text;
        container.appendChild(prompt);

        var btnContainer = document.createElement('div');
        btnContainer.className = 'prompt-button-container';
        container.appendChild(btnContainer);

        var keys = Object.keys(options);
        for(let i = 0; i < keys.length; ++i) {
            let text = keys[i];
            let func = options[text];

            let btn = document.createElement('button');
            btn.innerText = text;
            btn.className = 'prompt-button';
            btn.addEventListener('click', () => {
                // Allow this function to remove the prompt.
                func(() => { container.style.display = "none"; });
            });

            btnContainer.appendChild(btn);
        }

        document.body.appendChild(container);
        return container;
    }

    function show_toolbar_button(tbar, btnText, cb) {
        if(typeof(tbar) === 'string') {
            tbar = document.getElementById(tbar);
        }

        var btn = document.createElement('button');
        btn.innerText = btnText;

        // Use this style for now
        btn.className = 'prompt-button';
        tbar.appendChild(btn);

        btn.addEventListener('click', function() {
            // Allow the function to remove the button from the toolbar.
            cb(() => { tbar.remove(btn); });
        })
    }

    class LastFMGlobeViewer {
        constructor(container) {
            this.imageryProvider = new Cesium.BingMapsImageryProvider({
                url: 'https://dev.virtualearth.net',
                key: 'AmSMXKlAR0oa-6-XVoqoYvF4dE_OHIFaZkOaSOk348ZETNf8aHhPcN-ynso3EG0X'
            });

            this.viewer = new Cesium.Viewer(container, {
                imageryProvider: this.imageryProvider,
                baseLayerPicker: false,
                animation: false,
                geocoder: false,
                homeButton: false,
                sceneModePicker: false,
                timeline: false,
            });

            this.markers = {};
        }

        add_marker(id, pos, options) {
            options = options || {};
            const useExisting = options.useExisting || false;

            if(useExisting) {
                var existing = this.viewer.entities.getById(id);
                if(existing) return existing;
            }

            return this.viewer.entities.add({
                id: id,
                position: pos,
                billboard: {
                    image: './static/pin.png',
                    horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
                    verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                    scale: .70,
                },
            });
        }

        start_user_location_wizard(username, locate_token) {
            this.our_username = username;
            this.locate_token = locate_token;

            var locate_prompt_options = {};
            locate_prompt_options["I'll show you"] = (hide) => {
                // Stop showing prompt
                hide();

                this.enable_location_picking_mode();
            };

            if('geolocation' in navigator) {
                locate_prompt_options["Use my location"] = async (hide) => {
                    // Stop showing this prompt
                    hide();

                    // Hooray
                    try {
                        // Find user's location on the Cesium globe
                        var pos = await cartesianFromBrowserGeolocation();

                        // Add the marker for our user.
                        var marker = this.add_marker(
                            this.our_username, pos
                        );

                        // Fly to the user's location
                        await this.viewer.flyTo(marker, {duration: 2.0});

                        // Allow the user to adjust their location from here.
                        this.enable_location_picking_mode();
                    }
                    catch(err) {
                        show_prompt("Failed to get position: " + err.message, {
                            "I'll do it manually": (hide) => {
                                hide();

                                this.enable_location_picking_mode();
                            }
                        });
                    }
                }
            }

            // Add the location prompt right away!
            show_prompt("Where are you listening from?", locate_prompt_options);
        }

        enable_location_picking_mode(options) {
            options = options || {};

            // Find session key
            const username = options.username || this.our_username;
            if(!username) {
                throw "No username set and no default available."
            }

            const locate_token = options.locate_token || this.locate_token;
            if(!locate_token) {
                throw "No Location token found.";
            }

            // If there isn't a marker already, make one!
            var marker = this.viewer.entities.getById(username);
            if(!marker) {
                marker = this.add_marker(username, null);
            }

            // Enable mouse / marker adjustment
            this._set_click_cb((pos) => {
                marker.position = pos;
            });

            // Find toolbar ID or element.
            var tbar = options.toolbar || 'toolbar';

            // Add a toolbar button at the top
            show_toolbar_button(tbar, "Set my location!", async (remove) => {
                var that = this;

                try {
                    if (!marker.position) {
                        // Bah
                        throw {message: "No location set"};
                    }

                    // Convert current marker position to cartographic.
                    var cartographic_pos = Cesium.Cartographic.fromCartesian(
                        marker.position.getValue(Cesium.getTimestamp())
                    );

                    // Record position
                    await set_key_location(
                        username, locate_token, cartographic_pos
                    );

                    // Remove lock-in button
                    remove();

                    // Disable marker picking
                    this._disable_click();

                    // Inform the user!
                    show_prompt("Success!", {
                        "OK": function(hide) {
                            hide();

                            // AHHH CALLBACK HELL

                            // Link to viewer
                            show_prompt("Thanks!", {
                                "Show me the globe!": function(hide) {
                                    hide();
                                    that.enable_viewer();
                                }
                            });
                        }
                    });
                } catch(err) {
                    show_prompt("Error: " + err.message, {
                        "OK": function(hide) {
                            hide();
                        }
                    });
                }
            });
        }

        _set_click_cb(cb) {
            var pos = null;
            this.viewer.screenSpaceEventHandler.setInputAction((e) => {
                // Record mouse position
                var viewer = this.viewer;
                var ray = viewer.camera.getPickRay(e.position);
                pos = viewer.scene.globe.pick(ray, viewer.scene);
            }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

            this.viewer.screenSpaceEventHandler.setInputAction((e) => {
                // Cancel action
                pos = null;
            }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

            this.viewer.screenSpaceEventHandler.setInputAction((e) => {
                // Fire action
                if(pos) cb(pos);
            }, Cesium.ScreenSpaceEventType.LEFT_UP);
        }

        _disable_click() {
            // Disable events
            this.viewer.screenSpaceEventHandler.removeInputAction(
                Cesium.ScreenSpaceEventType.LEFT_DOWN
            );
            this.viewer.screenSpaceEventHandler.removeInputAction(
                Cesium.ScreenSpaceEventType.LEFT_UP
            );
            this.viewer.screenSpaceEventHandler.removeInputAction(
                Cesium.ScreenSpaceEventType.MOUSE_MOVE
            );
        }

        async enable_viewer() {
            // Start requesting users' data from the server.
            var res = await get_globe(-73.58883, 40.878116, 8);

            for(var i = 0; i < res.length; ++i) {
                var user = res[i];

                var pos = Cesium.Cartesian3.fromDegrees(
                    user.longitude, user.latitude
                );

                user.marker = this.add_marker(user.user.username, pos, {
                    useExisting: true
                });
                user.marker.name = user.user.realname;
                user.marker.description = JSON.stringify(user.user);
            }
        }
    }

    return {
        Viewer: LastFMGlobeViewer,
    };
}());