const url_params = new URLSearchParams(window.location.search);

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
    for(var i = 0; i < keys.length; ++i) {
        var text = keys[i];
        var func = options[text];

        var btn = document.createElement('button');
        btn.innerText = text;
        btn.className = 'prompt-button';
        btn.addEventListener('click', func.bind(container));

        btnContainer.appendChild(btn);
    }

    document.body.appendChild(container);
    return container;
}

function make_marker(viewer, pos) {
    var billboard = viewer.entities.add({
        position: pos,
        billboard: {
            image: './static/pin.png',
            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            scale: .70,
        }
    });
    return billboard;
}

function enable_location_picking_mode(viewer, options) {
    options = options || {};

    var tbar = options.toolbar || 'toolbar';
    if(typeof(tbar) === 'string') {
        tbar = document.getElementById(tbar);
    }

    // Add a toolbar button at the top
    var btn = document.createElement('button');
    btn.innerText = "Lock-in location!";

    // Use this style for now
    btn.className = 'prompt-button';
    tbar.appendChild(btn);

    // If there isn't a marker already, make one!
    var marker = options.marker || make_marker(viewer, null);

    // Enable clicking on the map
    var cancel = false;
    var pos = null;
    viewer.screenSpaceEventHandler.setInputAction(function(e) {
        var ray = viewer.camera.getPickRay(e.position);
        pos = viewer.scene.globe.pick(ray, viewer.scene);

        cancel = false;
    }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

    viewer.screenSpaceEventHandler.setInputAction(function(e) {
        cancel = true;
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    viewer.screenSpaceEventHandler.setInputAction(function(e) {
        // Should we cancel?
        if(cancel) return;

        // Adjust marker position
        marker.position = pos;
    }, Cesium.ScreenSpaceEventType.LEFT_UP);

    // Enable lock-in button
    btn.addEventListener('click', function() {
        // Convert to cartographic.
        var cartographic_pos = Cesium.Cartographic.fromCartesian(
            marker.position.getValue(Cesium.getTimestamp())
        );
        data = {
            longitude: Cesium.Math.toDegrees(cartographic_pos.longitude),
            latitude: Cesium.Math.toDegrees(cartographic_pos.latitude),
            key: url_params.get('api_key'),
        };

        // Record position
        var xhttp = new XMLHttpRequest();
        xhttp.onreadystatechange = function(val) {
            if(xhttp.readyState === XMLHttpRequest.DONE) {
                if(xhttp.status === 200) {
                    // Success

                    // Remove lock-in button
                    tbar.remove(btn);

                    // Disable events
                    viewer.screenSpaceEventHandler.removeInputAction(
                        Cesium.ScreenSpaceEventType.LEFT_DOWN
                    );
                    viewer.screenSpaceEventHandler.removeInputAction(
                        Cesium.ScreenSpaceEventType.LEFT_UP
                    );
                    viewer.screenSpaceEventHandler.removeInputAction(
                        Cesium.ScreenSpaceEventType.MOUSE_MOVE
                    );

                    // Inform the user!
                    show_prompt("Success!", {
                       "OK": function() {
                           this.style.display = 'none';

                           // AHHH CALLBACK HELL

                           // Link to viewer
                           show_prompt("Thanks!", {
                               "Show me the globe!": function() {
                                   this.style.display = 'none';

                                   //enable_viewer();
                               }
                           });
                       }
                    });
                } else if(xhttp.status === 422) {
                    show_prompt("Error: " + xhttp.responseText, {
                        "OK": function() {
                            this.style.display = 'none';
                        }
                    });
                }
            }
        };
        xhttp.open('POST', '/set_key_location', true);
        xhttp.setRequestHeader('Content-Type', 'application/json');
        xhttp.send(JSON.stringify(data));
    });
}

document.addEventListener('DOMContentLoaded', function() {
    var imageryProvider = new Cesium.BingMapsImageryProvider({
        url: 'https://dev.virtualearth.net',
        key: 'AmSMXKlAR0oa-6-XVoqoYvF4dE_OHIFaZkOaSOk348ZETNf8aHhPcN-ynso3EG0X'
    });

    var viewer = new Cesium.Viewer('cesiumContainer', {
        imageryProvider: imageryProvider,
        baseLayerPicker: false,
        animation: false,
        geocoder: false,
        homeButton: false,
        sceneModePicker: false,
        timeline: false,
    });

    var locate_prompt_options = {
        "I'll show you": function() {
            // Stop showing prompt
            this.style.display = 'none';

            enable_location_picking_mode(viewer);
        },
    };

    if('geolocation' in navigator) {
        locate_prompt_options["Use my location"] = function () {
            // Stop showing this prompt
            this.style.display = 'none';
            // Hooray
            const pos_options = {
                enableHighAccuracy: true
            };
            navigator.geolocation.getCurrentPosition(function(position) {
                var pos = new Cesium.Cartesian3.fromDegrees(
                    position.coords.longitude, position.coords.latitude
                );

                var marker = make_marker(viewer, pos);

                viewer.flyTo(marker, { duration: 2.0 }).then(function(){
                    enable_location_picking_mode(viewer, {marker});
                });
            }, function(err) {
                // Show the error
                show_prompt("Failed to get position: " + err.message, {
                    "I'll do it manually": function() {
                        this.style.display = 'none';
                        enable_location_picking_mode(viewer);
                    }
                });
            }, pos_options);
        }
    }

    // Add the location prompt right away!
    show_prompt("Where are you listening from?", locate_prompt_options);
});