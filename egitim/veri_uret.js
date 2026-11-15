const fs = require("fs");
const path = require("path");
const S = require(path.join(__dirname, "..", "site", "sim.js"));

let tohum = 20261115;
function rastgele() {
  tohum = (tohum + 0x6d2b79f5) | 0;
  let t = Math.imul(tohum ^ (tohum >>> 15), 1 | tohum);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function aralik(a, b) {
  return a + rastgele() * (b - a);
}

const bosModel = { cikisAgirlik: [], cikisSabiti: 0 };
const bolumSayisi = 240;
const bolumSuresi = 1500;
const satirlar = ["bolum,saniye,egim,pompa,sicaklikOlcekli,sicaklik"];

for (let bolum = 0; bolum < bolumSayisi; bolum++) {
  const f = S.fizikOlustur();
  f.rastgele = 1000 + bolum * 7919;
  f.ortam = aralik(10, 35);
  f.batarya = f.ortam + aralik(0, 10);
  f.sensor = f.batarya;
  const m = S.mlOlustur(bosModel);
  const karar = S.klasikOlustur();
  let yukBitis = 0;
  let pompaBitis = 0;
  let kip = 0;
  let oteleme = 0;
  let sabitPwm = 0;

  for (let saniye = 1; saniye <= bolumSuresi; saniye++) {
    if (saniye >= yukBitis) {
      f.yuk = rastgele() < 0.3 ? 0 : rastgele();
      yukBitis = saniye + Math.floor(aralik(15, 180));
    }
    if (saniye >= pompaBitis) {
      const zar = rastgele();
      kip = zar < 0.25 ? 0 : zar < 0.8 ? 1 : 2;
      oteleme = aralik(-2, 7);
      sabitPwm = rastgele() < 0.3 ? 0 : Math.floor(aralik(90, 256));
      pompaBitis = saniye + Math.floor(aralik(30, 150));
    }
    S.fizikIlerlet(f);
    const olcum = S.mlOlc(m, f);
    let pwm;
    if (kip === 0) pwm = S.pompaGucuHesapla(karar, olcum.sicaklik);
    else if (kip === 1) pwm = S.pompaGucuHesapla(karar, olcum.sicaklik + oteleme);
    else pwm = sabitPwm;
    satirlar.push([bolum, saniye, olcum.girdi[0].toFixed(5), olcum.girdi[1].toFixed(5), olcum.girdi[2].toFixed(5), olcum.sicaklik.toFixed(5)].join(","));
    m.pompaOrani = pwm / 255;
    f.pompaPwm = pwm;
  }
}

fs.writeFileSync(path.join(__dirname, "veri.csv"), satirlar.join("\n") + "\n");
console.log("satir:", satirlar.length - 1);
