#include <EEPROM.h>
#include "model.h"

const int sensorPin = A0;
const int pompaPin = 3;
const int buzzerPin = 8;
const int yesilLedPin = 4;
const int kirmiziLedPin = 7;

const float pompaAcmaSicakligi = 30.0;
const float pompaKapamaSicakligi = 27.0;
const float tamGucSicakligi = 45.0;
const float alarmSicakligi = 55.0;
const float sensorEnDusuk = 1.0;
const float sensorEnYuksek = 120.0;

const int enDusukPompaGucu = 90;
const int enYuksekPompaGucu = 255;
const int olcumSayisi = 10;
const unsigned long olcumAraligi = 1000;

const int egimAraligi = 5;
const int tahminSuresi = 20;
const float sicaklikMerkezi = 25.0;
const float sicaklikOlcegi = 10.0;
const float yumusatma = 0.3;
const float enFazlaTahminFarki = 10.0;

const float ogrenmeHizi = 0.002;
const float enFazlaHata = 3.0;
const unsigned long kayitAraligi = 600000;
const int hafizaAdresi = 0;
const long hafizaImzasi = 20261115;

struct Ogrenilenler {
  long imza;
  float cikisAgirlik[gizliSayisi];
  float cikisSabiti;
  unsigned long guncellemeSayisi;
};

Ogrenilenler ogrenilen;

float sicaklikGecmisi[egimAraligi];
int sicaklikSirasi = 0;
int sicaklikKayitSayisi = 0;

float egitimGirdisi[tahminSuresi][girdiSayisi];
float egitimSicakligi[tahminSuresi];
int egitimSirasi = 0;
int egitimKayitSayisi = 0;

float yumusakSicaklik = 0.0;
float pompaOrani = 0.0;
bool ilkOlcum = true;
bool pompaCalisiyor = false;
unsigned long sonOlcumZamani = 0;
unsigned long sonKayitZamani = 0;

void ogrenilenleriYukle() {
  EEPROM.get(hafizaAdresi, ogrenilen);
  if (ogrenilen.imza == hafizaImzasi) {
    return;
  }
  ogrenilen.imza = hafizaImzasi;
  for (int n = 0; n < gizliSayisi; n++) {
    ogrenilen.cikisAgirlik[n] = baslangicCikisAgirlik[n];
  }
  ogrenilen.cikisSabiti = baslangicCikisSabiti;
  ogrenilen.guncellemeSayisi = 0;
}

void ogrenilenleriKaydet() {
  EEPROM.put(hafizaAdresi, ogrenilen);
}

float sicaklikOku() {
  long toplam = 0;
  for (int i = 0; i < olcumSayisi; i++) {
    toplam += analogRead(sensorPin);
    delay(2);
  }
  float ortalama = toplam / (float)olcumSayisi;
  return ortalama * 500.0 / 1023.0;
}

bool sensorArizali(float sicaklik) {
  return sicaklik < sensorEnDusuk || sicaklik > sensorEnYuksek;
}

float sicaklikYumusat(float sicaklik) {
  if (ilkOlcum) {
    yumusakSicaklik = sicaklik;
    ilkOlcum = false;
  } else {
    yumusakSicaklik = yumusakSicaklik + yumusatma * (sicaklik - yumusakSicaklik);
  }
  return yumusakSicaklik;
}

float egimHesapla(float sicaklik) {
  if (sicaklikKayitSayisi < egimAraligi) {
    return 0.0;
  }
  return sicaklik - sicaklikGecmisi[sicaklikSirasi];
}

void sicaklikKaydet(float sicaklik) {
  sicaklikGecmisi[sicaklikSirasi] = sicaklik;
  sicaklikSirasi = (sicaklikSirasi + 1) % egimAraligi;
  if (sicaklikKayitSayisi < egimAraligi) {
    sicaklikKayitSayisi++;
  }
}

void gizliKatmanHesapla(float girdi[], float gizli[]) {
  for (int n = 0; n < gizliSayisi; n++) {
    float toplam = gizliSabit[n];
    for (int g = 0; g < girdiSayisi; g++) {
      toplam += gizliAgirlik[n][g] * girdi[g];
    }
    if (toplam < 0) {
      toplam = 0;
    }
    gizli[n] = toplam;
  }
}

float cikisHesapla(float gizli[]) {
  float sonuc = ogrenilen.cikisSabiti;
  for (int n = 0; n < gizliSayisi; n++) {
    sonuc += ogrenilen.cikisAgirlik[n] * gizli[n];
  }
  return sonuc;
}

void modeliEgit(float sicaklik) {
  if (egitimKayitSayisi < tahminSuresi) {
    return;
  }
  float gizli[gizliSayisi];
  gizliKatmanHesapla(egitimGirdisi[egitimSirasi], gizli);

  float gercekDegisim = sicaklik - egitimSicakligi[egitimSirasi];
  float hata = gercekDegisim - cikisHesapla(gizli);
  if (hata > enFazlaHata) {
    hata = enFazlaHata;
  }
  if (hata < -enFazlaHata) {
    hata = -enFazlaHata;
  }

  for (int n = 0; n < gizliSayisi; n++) {
    ogrenilen.cikisAgirlik[n] += ogrenmeHizi * hata * gizli[n];
  }
  ogrenilen.cikisSabiti += ogrenmeHizi * hata;
  ogrenilen.guncellemeSayisi++;
}

void egitimeKaydet(float girdi[], float sicaklik) {
  for (int g = 0; g < girdiSayisi; g++) {
    egitimGirdisi[egitimSirasi][g] = girdi[g];
  }
  egitimSicakligi[egitimSirasi] = sicaklik;
  egitimSirasi = (egitimSirasi + 1) % tahminSuresi;
  if (egitimKayitSayisi < tahminSuresi) {
    egitimKayitSayisi++;
  }
}

float gelecekSicaklikTahminEt(float girdi[], float sicaklik) {
  float gizli[gizliSayisi];
  gizliKatmanHesapla(girdi, gizli);
  float degisim = cikisHesapla(gizli);
  if (degisim > enFazlaTahminFarki) {
    degisim = enFazlaTahminFarki;
  }
  if (degisim < -enFazlaTahminFarki) {
    degisim = -enFazlaTahminFarki;
  }
  return sicaklik + degisim;
}

int pompaGucuHesapla(float sicaklik) {
  if (sicaklik >= pompaAcmaSicakligi) {
    pompaCalisiyor = true;
  }
  if (sicaklik <= pompaKapamaSicakligi) {
    pompaCalisiyor = false;
  }
  if (!pompaCalisiyor) {
    return 0;
  }
  if (sicaklik >= tamGucSicakligi) {
    return enYuksekPompaGucu;
  }
  float oran = (sicaklik - pompaKapamaSicakligi) / (tamGucSicakligi - pompaKapamaSicakligi);
  return enDusukPompaGucu + oran * (enYuksekPompaGucu - enDusukPompaGucu);
}

void durumGoster(float sicaklik, float tahmin, int pompaGucu, bool ariza) {
  bool alarm = ariza || sicaklik >= alarmSicakligi;

  digitalWrite(kirmiziLedPin, alarm ? HIGH : LOW);
  digitalWrite(yesilLedPin, alarm ? LOW : HIGH);

  if (alarm) {
    tone(buzzerPin, 2000);
  } else {
    noTone(buzzerPin);
  }

  Serial.print("Sicaklik: ");
  Serial.print(sicaklik, 1);
  Serial.print(" C | 20 sn sonra tahmin: ");
  Serial.print(tahmin, 1);
  Serial.print(" C | Pompa: %");
  Serial.print(pompaGucu * 100 / enYuksekPompaGucu);
  Serial.print(" | Ogrenme adimi: ");
  Serial.print(ogrenilen.guncellemeSayisi);
  Serial.print(" | Durum: ");

  if (ariza) {
    Serial.println("SENSOR ARIZASI");
  } else if (alarm) {
    Serial.println("ALARM");
  } else if (pompaGucu > 0 && sicaklik < pompaAcmaSicakligi && tahmin > sicaklik) {
    Serial.println("ERKEN SOGUTMA");
  } else if (pompaGucu > 0) {
    Serial.println("SOGUTMA");
  } else {
    Serial.println("NORMAL");
  }
}

void setup() {
  pinMode(pompaPin, OUTPUT);
  pinMode(buzzerPin, OUTPUT);
  pinMode(yesilLedPin, OUTPUT);
  pinMode(kirmiziLedPin, OUTPUT);
  Serial.begin(9600);
  ogrenilenleriYukle();
}

void loop() {
  unsigned long simdi = millis();
  if (simdi - sonOlcumZamani < olcumAraligi) {
    return;
  }
  sonOlcumZamani = simdi;

  float hamSicaklik = sicaklikOku();
  bool ariza = sensorArizali(hamSicaklik);
  float sicaklik = hamSicaklik;
  float tahmin = hamSicaklik;
  int pompaGucu;

  if (ariza) {
    pompaGucu = enYuksekPompaGucu;
    sicaklikKayitSayisi = 0;
    egitimKayitSayisi = 0;
    ilkOlcum = true;
  } else {
    sicaklik = sicaklikYumusat(hamSicaklik);
    float egim = egimHesapla(sicaklik);
    sicaklikKaydet(sicaklik);

    float girdi[girdiSayisi] = {egim, pompaOrani, (sicaklik - sicaklikMerkezi) / sicaklikOlcegi};
    modeliEgit(sicaklik);
    egitimeKaydet(girdi, sicaklik);
    tahmin = gelecekSicaklikTahminEt(girdi, sicaklik);

    float kararSicakligi = sicaklik;
    if (tahmin > kararSicakligi) {
      kararSicakligi = tahmin;
    }
    pompaGucu = pompaGucuHesapla(kararSicakligi);
  }

  pompaOrani = pompaGucu / (float)enYuksekPompaGucu;
  analogWrite(pompaPin, pompaGucu);
  durumGoster(sicaklik, tahmin, pompaGucu, ariza);

  if (simdi - sonKayitZamani >= kayitAraligi) {
    sonKayitZamani = simdi;
    ogrenilenleriKaydet();
  }
}
