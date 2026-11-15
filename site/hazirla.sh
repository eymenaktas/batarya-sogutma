#!/bin/sh
set -e
cd "$(dirname "$0")"
mkdir -p kod ort
cp ../klasik/klasik.ino ../ml/ml.ino ../ml/model.h ../egitim/egit.py kod/
if [ ! -f ort/ort-wasm-simd-threaded.wasm ]; then
  gecici="$(mktemp -d)"
  (cd "$gecici" && npm pack onnxruntime-web@1.22.0 --silent && tar xzf onnxruntime-web-1.22.0.tgz)
  cp "$gecici/package/dist/ort.wasm.min.js" "$gecici/package/dist/ort-wasm-simd-threaded.wasm" ort/
  cp "$gecici/package/dist/ort-wasm-simd-threaded.mjs" ort/ort-wasm-simd-threaded.js
  rm -rf "$gecici"
fi
