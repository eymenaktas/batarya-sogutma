const int sensorPin = A0;
const int pompaPin = 9;
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

const int gecmisBoyutu = 20;
const int egimAraligi = 5;
const float ogrenmeHizi = 0.02;
const float yumusatma = 0.3;
const float enFazlaTahminFarki = 10.0;

float gecmisSicaklik[gecmisBoyutu];
float gecmisEgim[gecmisBoyutu];
float gecmisPompa[gecmisBoyutu];
int gecmisSirasi = 0;
int kayitSayisi = 0;

float agirlikEgim = 0.0;
float agirlikPompa = 0.0;
float agirlikSabit = 0.0;

float yumusakSicaklik = 0.0;
float pompaOrani = 0.0;
bool ilkOlcum = true;
bool pompaCalisiyor = false;
unsigned long sonOlcumZamani = 0;

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
  if (kayitSayisi < gecmisBoyutu) {
    return 0.0;
  }
  int eskiSira = (gecmisSirasi + gecmisBoyutu - egimAraligi) % gecmisBoyutu;
  return sicaklik - gecmisSicaklik[eskiSira];
}

float degisimTahminEt(float egim, float pompa) {
  return agirlikEgim * egim + agirlikPompa * pompa + agirlikSabit;
}

void modeliEgit(float sicaklik) {
  if (kayitSayisi < gecmisBoyutu) {
    return;
  }
  float eskiEgim = gecmisEgim[gecmisSirasi];
  float eskiPompa = gecmisPompa[gecmisSirasi];
  float gercekDegisim = sicaklik - gecmisSicaklik[gecmisSirasi];
  float hata = gercekDegisim - degisimTahminEt(eskiEgim, eskiPompa);

  agirlikEgim += ogrenmeHizi * hata * eskiEgim;
  agirlikPompa += ogrenmeHizi * hata * eskiPompa;
  agirlikSabit += ogrenmeHizi * hata;
}

void gecmiseKaydet(float sicaklik, float egim, float pompa) {
  gecmisSicaklik[gecmisSirasi] = sicaklik;
  gecmisEgim[gecmisSirasi] = egim;
  gecmisPompa[gecmisSirasi] = pompa;
  gecmisSirasi = (gecmisSirasi + 1) % gecmisBoyutu;
  if (kayitSayisi < gecmisBoyutu) {
    kayitSayisi++;
  }
}

float gelecekSicaklikTahminEt(float sicaklik, float egim) {
  float degisim = degisimTahminEt(egim, pompaOrani);
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
  } else {
    sicaklik = sicaklikYumusat(hamSicaklik);
    float egim = egimHesapla(sicaklik);
    modeliEgit(sicaklik);
    gecmiseKaydet(sicaklik, egim, pompaOrani);
    tahmin = gelecekSicaklikTahminEt(sicaklik, egim);

    float kararSicakligi = sicaklik;
    if (tahmin > kararSicakligi) {
      kararSicakligi = tahmin;
    }
    pompaGucu = pompaGucuHesapla(kararSicakligi);
  }

  pompaOrani = pompaGucu / (float)enYuksekPompaGucu;
  analogWrite(pompaPin, pompaGucu);
  durumGoster(sicaklik, tahmin, pompaGucu, ariza);
}
