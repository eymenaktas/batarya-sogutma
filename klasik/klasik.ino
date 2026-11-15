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

void durumGoster(float sicaklik, int pompaGucu, bool ariza) {
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
  Serial.print(" C | Pompa: %");
  Serial.print(pompaGucu * 100 / enYuksekPompaGucu);
  Serial.print(" | Durum: ");

  if (ariza) {
    Serial.println("SENSOR ARIZASI");
  } else if (alarm) {
    Serial.println("ALARM");
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

  float sicaklik = sicaklikOku();
  bool ariza = sensorArizali(sicaklik);
  int pompaGucu;

  if (ariza) {
    pompaGucu = enYuksekPompaGucu;
  } else {
    pompaGucu = pompaGucuHesapla(sicaklik);
  }

  analogWrite(pompaPin, pompaGucu);
  durumGoster(sicaklik, pompaGucu, ariza);
}
