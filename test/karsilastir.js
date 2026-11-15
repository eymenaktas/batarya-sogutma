const fs = require("fs");
const path = require("path");
const S = require(path.join(__dirname, "..", "site", "sim.js"));

function senaryoYuku(saniye) {
  const t = saniye % 900;
  if (t < 60) return 0.2;
  if (t < 240) return 1.0;
  if (t < 420) return 0.3;
  if (t < 600) return 0.8;
  return 0.1;
}

function jsCalistir(olustur, adim) {
  const f = S.fizikOlustur();
  const k = olustur();
  const satirlar = [];
  for (let saniye = 1; saniye <= 3600; saniye++) {
    f.yuk = senaryoYuku(saniye);
    f.sensorKopuk = saniye >= 3500 && saniye < 3520;
    S.saniyeIlerlet(f, k, adim);
    satirlar.push([saniye, f.batarya, f.pompaPwm]);
  }
  return { satirlar, k };
}

function ozet(ad, satirlar) {
  let tepe = 0;
  let pompaToplam = 0;
  let ustunde40 = 0;
  for (const [, sicaklik, pwm] of satirlar) {
    if (sicaklik > tepe) tepe = sicaklik;
    pompaToplam += pwm;
    if (sicaklik > 40) ustunde40++;
  }
  console.log(ad, "tepe:", tepe.toFixed(2), "C | ortalama pompa: %" + (pompaToplam / satirlar.length / 2.55).toFixed(1), "| 40 C ustu saniye:", ustunde40);
}

function karsilastir(ad, csvYolu, js) {
  const c = fs.readFileSync(csvYolu, "utf8").trim().split("\n").map((s) => s.split(",").map(Number));
  let enBuyukSicaklikFarki = 0;
  let pwmFarkliSatir = 0;
  for (let i = 0; i < c.length; i++) {
    const fark = Math.abs(c[i][1] - js.satirlar[i][1]);
    if (fark > enBuyukSicaklikFarki) enBuyukSicaklikFarki = fark;
    if (c[i][2] !== js.satirlar[i][2]) pwmFarkliSatir++;
  }
  ozet(ad + " (C kodu)", c);
  console.log(ad, "C ile JS arasi en buyuk sicaklik farki:", enBuyukSicaklikFarki.toFixed(4), "| PWM farkli satir:", pwmFarkliSatir, "/", c.length);
  const arizaAni = c[3504];
  console.log(ad, "sensor koptugunda PWM:", arizaAni[2]);
  return enBuyukSicaklikFarki < 0.05 && arizaAni[2] === 255;
}

const klasik = jsCalistir(S.klasikOlustur, S.klasikAdim);
const ml = jsCalistir(S.mlOlustur, S.mlAdim);
const tamam1 = karsilastir("klasik", process.argv[2], klasik);
const tamam2 = karsilastir("ml", process.argv[3], ml);
console.log("ml agirliklar: egim", ml.k.agirlikEgim.toFixed(3), "pompa", ml.k.agirlikPompa.toFixed(3), "sabit", ml.k.agirlikSabit.toFixed(3));
process.exit(tamam1 && tamam2 ? 0 : 1);
