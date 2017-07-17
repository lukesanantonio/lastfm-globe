#!/usr/bin/env bash

# Copyright (c) 2017 Luke San Antonio Bialecki
# All rights reserved

# Released under the BSD 2-Clause license

cd "$(dirname "$0")"

mkdir -p public/cesium
cd public/cesium

archive="cesium.zip"

curl http://cesiumjs.org/releases/Cesium-1.32.zip -o $archive

mkdir -p Build Source

unzip $archive "Build/*" "Source/*" "README.md" "LICENSE.md" "CHANGES.md"
rm $archive
