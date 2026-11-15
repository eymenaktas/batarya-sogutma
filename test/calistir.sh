#!/bin/sh
set -e
cd "$(dirname "$0")"
mkdir -p cikti
g++ -x c++ -std=c++11 -w -I. -DINO='"../klasik/klasik.ino"' sim.cpp -o cikti/klasik
g++ -x c++ -std=c++11 -w -I. -DINO='"../ml/ml.ino"' sim.cpp -o cikti/ml
./cikti/klasik > cikti/klasik.csv
./cikti/ml > cikti/ml.csv
node karsilastir.js cikti/klasik.csv cikti/ml.csv
