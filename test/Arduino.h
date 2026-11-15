#ifndef SAHTE_ARDUINO_H
#define SAHTE_ARDUINO_H

#include <math.h>
#include <stdio.h>

#define A0 14
#define HIGH 1
#define LOW 0
#define OUTPUT 1

static double bataryaSicakligi = 25.0;
static double sensorSicakligi = 25.0;
static double ortamSicakligi = 25.0;
static double yukOrani = 0.0;
static int pompaPwm = 0;
static bool sensorKopuk = false;
static unsigned long sanalZaman = 0;
static long long rastgeleDurum = 12345;

static const double isiSigasi = 150.0;
static const double azamiIsi = 40.0;
static const double pasifKayip = 0.3;
static const double pompaSogutma = 3.0;
static const double sensorGecikmesi = 6.0;

static void fizikAdimi(double dt) {
  double oran = pompaPwm / 255.0;
  double isi = azamiIsi * yukOrani;
  double kayip = (pasifKayip + pompaSogutma * oran) * (bataryaSicakligi - ortamSicakligi);
  bataryaSicakligi += (isi - kayip) / isiSigasi * dt;
  sensorSicakligi += (bataryaSicakligi - sensorSicakligi) * dt / sensorGecikmesi;
}

static int analogRead(int) {
  if (sensorKopuk) {
    return 0;
  }
  rastgeleDurum = rastgeleDurum * 48271 % 2147483647;
  double gurultu = (rastgeleDurum % 2001) / 1000.0 - 1.0;
  int deger = (int)floor(sensorSicakligi * 1023.0 / 500.0 + 0.5 + gurultu);
  if (deger < 0) deger = 0;
  if (deger > 1023) deger = 1023;
  return deger;
}

static void analogWrite(int, int deger) { pompaPwm = deger; }
static void digitalWrite(int, int) {}
static void pinMode(int, int) {}
static void delay(unsigned long) {}
static void tone(int, int) {}
static void noTone(int) {}
static unsigned long millis() { return sanalZaman; }

struct SahteSerial {
  void begin(long) {}
  void print(const char *) {}
  void print(double, int) {}
  void print(int) {}
  void println(const char *) {}
};
static SahteSerial Serial;

#endif
