const fs = require("fs");
const path = require("path");
const S = require(path.join(__dirname, "..", "site", "sim.js"));
const model = require(path.join(__dirname, "..", "site", "model.json"));

const senaryolar = [
  { kimlik: "hizlanma", ad: "Ani hızlanma", yuk: (t) => (t % 240 < 50 ? 100 : 0) },
  { kimlik: "sehir", ad: "Şehir içi", yuk: (t) => [25, 60, 10, 45, 0, 70, 20, 35][Math.floor(t / 40) % 8] },
  { kimlik: "yokus", ad: "Uzun yokuş", yuk: (t) => (t % 360 < 240 ? 90 : 20) },
  { kimlik: "sarj", ad: "Hızlı şarj", yuk: () => 75 }
];

function kos(olustur, adim, yuk, sure, ortam, hiz) {
  S.ayar.ogrenmeHizi = hiz;
  const f = S.fizikOlustur();
  f.ortam = ortam;
  f.batarya = ortam;
  f.sensor = ortam;
  const k = olustur();
  let tepe = 0;
  let ust = 0;
  let pompa = 0;
  const hatalar = [];
  for (let s = 1; s <= sure; s++) {
    f.yuk = yuk(s) / 100;
    S.saniyeIlerlet(f, k, adim);
    if (f.batarya > tepe) tepe = f.batarya;
    if (f.batarya > 32) ust++;
    pompa += f.pompaPwm / 2.55;
    if (k.sonHata !== null && k.sonHata !== undefined) hatalar.push([s, Math.abs(k.sonHata), Math.abs(k.sonHataBaslangic)]);
  }
  return { tepe: +tepe.toFixed(2), ust32: ust, pompa: +(pompa / sure).toFixed(1), hatalar, k };
}

function sade(sonuc) {
  return { tepe: sonuc.tepe, ust32: sonuc.ust32, pompa: sonuc.pompa };
}

const sure = 2400;
const tablo = senaryolar.map((sn) => ({
  kimlik: sn.kimlik,
  ad: sn.ad,
  klasik: sade(kos(S.klasikOlustur, S.klasikAdim, sn.yuk, sure, 20, 0.002)),
  mlSabit: sade(kos(() => S.mlOlustur(model), S.mlAdim, sn.yuk, sure, 20, 0)),
  ml: sade(kos(() => S.mlOlustur(model), S.mlAdim, sn.yuk, sure, 20, 0.002))
}));

const asil = { isiSigasi: S.ayar.isiSigasi, pompaSogutma: S.ayar.pompaSogutma, pasifKayip: S.ayar.pasifKayip };
S.ayar.isiSigasi = 100;
S.ayar.pompaSogutma = 2.0;
S.ayar.pasifKayip = 0.5;
const karisik = (t) => (Math.floor(t / 600) % 2 === 0 ? senaryolar[0].yuk(t) : senaryolar[1].yuk(t));
const uzun = kos(() => S.mlOlustur(model), S.mlAdim, karisik, 14400, 30, 0.002);
Object.assign(S.ayar, asil);

const dilim = 900;
const ogrenme = [];
for (let b = 0; b < 14400 / dilim; b++) {
  const parca = uzun.hatalar.filter((h) => h[0] > b * dilim && h[0] <= (b + 1) * dilim);
  const ort = (i) => parca.reduce((t, h) => t + h[i], 0) / parca.length;
  ogrenme.push({ dakika: ((b + 1) * dilim) / 60, ogrenen: +ort(1).toFixed(3), sabit: +ort(2).toFixed(3) });
}

const dayaniklilik = kos(() => S.mlOlustur(model), S.mlAdim, karisik, 86400, 25, 0.002);
const saglam = dayaniklilik.k.cikisAgirlik.every((v) => Number.isFinite(v) && Math.abs(v) < 100);

const cikti = { sureDakika: sure / 60, ortam: 20, senaryolar: tablo, ogrenme, farkliBatarya: { isiSigasi: 100, pompaSogutma: 2.0, pasifKayip: 0.5, ortam: 30 } };
fs.writeFileSync(path.join(__dirname, "..", "site", "analiz.json"), JSON.stringify(cikti));
console.table(tablo.map((s) => ({ senaryo: s.ad, kTepe: s.klasik.tepe, sTepe: s.mlSabit.tepe, mTepe: s.ml.tepe, kUst: s.klasik.ust32, sUst: s.mlSabit.ust32, mUst: s.ml.ust32, kP: s.klasik.pompa, sP: s.mlSabit.pompa, mP: s.ml.pompa })));
console.table(ogrenme);
console.log("24 saat sonra agirliklar saglam:", saglam, dayaniklilik.k.cikisAgirlik.map((v) => v.toFixed(2)).join(" "));
process.exit(saglam ? 0 : 1);
