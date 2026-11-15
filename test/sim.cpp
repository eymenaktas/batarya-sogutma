#include "Arduino.h"
#include INO

static double senaryoYuku(long saniye) {
  long t = saniye % 900;
  if (t < 60) return 0.2;
  if (t < 240) return 1.0;
  if (t < 420) return 0.3;
  if (t < 600) return 0.8;
  return 0.1;
}

int main() {
  setup();
  for (long saniye = 1; saniye <= 3600; saniye++) {
    yukOrani = senaryoYuku(saniye);
    sensorKopuk = saniye >= 3500 && saniye < 3520;
    for (int i = 0; i < 10; i++) {
      fizikAdimi(0.1);
    }
    sanalZaman += 1000;
    loop();
    printf("%ld,%.4f,%d\n", saniye, bataryaSicakligi, pompaPwm);
  }
  return 0;
}
