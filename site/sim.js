(function (kok) {
  const ayar = {
    pompaAcmaSicakligi: 30.0,
    pompaKapamaSicakligi: 27.0,
    tamGucSicakligi: 45.0,
    alarmSicakligi: 55.0,
    sensorEnDusuk: 1.0,
    sensorEnYuksek: 120.0,
    enDusukPompaGucu: 90,
    enYuksekPompaGucu: 255,
    olcumSayisi: 10,
    gecmisBoyutu: 20,
    egimAraligi: 5,
    ogrenmeHizi: 0.02,
    yumusatma: 0.3,
    enFazlaTahminFarki: 10.0,
    isiSigasi: 150.0,
    azamiIsi: 40.0,
    pasifKayip: 0.3,
    pompaSogutma: 3.0,
    sensorGecikmesi: 6.0
  };

  function fizikOlustur() {
    return {
      batarya: 25.0,
      sensor: 25.0,
      ortam: 25.0,
      yuk: 0.0,
      pompaPwm: 0,
      sensorKopuk: false,
      rastgele: 12345
    };
  }

  function fizikAdimi(f, dt) {
    const oran = f.pompaPwm / 255.0;
    const isi = ayar.azamiIsi * f.yuk;
    const kayip = (ayar.pasifKayip + ayar.pompaSogutma * oran) * (f.batarya - f.ortam);
    f.batarya += (isi - kayip) / ayar.isiSigasi * dt;
    f.sensor += (f.batarya - f.sensor) * dt / ayar.sensorGecikmesi;
  }

  function analogOku(f) {
    if (f.sensorKopuk) {
      return 0;
    }
    f.rastgele = f.rastgele * 48271 % 2147483647;
    const gurultu = (f.rastgele % 2001) / 1000.0 - 1.0;
    let deger = Math.floor(f.sensor * 1023.0 / 500.0 + 0.5 + gurultu);
    if (deger < 0) deger = 0;
    if (deger > 1023) deger = 1023;
    return deger;
  }

  function sicaklikOku(f) {
    let toplam = 0;
    for (let i = 0; i < ayar.olcumSayisi; i++) {
      toplam += analogOku(f);
    }
    const ortalama = toplam / ayar.olcumSayisi;
    return ortalama * 500.0 / 1023.0;
  }

  function sensorArizali(sicaklik) {
    return sicaklik < ayar.sensorEnDusuk || sicaklik > ayar.sensorEnYuksek;
  }

  function pompaGucuHesapla(k, sicaklik) {
    if (sicaklik >= ayar.pompaAcmaSicakligi) {
      k.pompaCalisiyor = true;
    }
    if (sicaklik <= ayar.pompaKapamaSicakligi) {
      k.pompaCalisiyor = false;
    }
    if (!k.pompaCalisiyor) {
      return 0;
    }
    if (sicaklik >= ayar.tamGucSicakligi) {
      return ayar.enYuksekPompaGucu;
    }
    const oran = (sicaklik - ayar.pompaKapamaSicakligi) / (ayar.tamGucSicakligi - ayar.pompaKapamaSicakligi);
    return Math.trunc(ayar.enDusukPompaGucu + oran * (ayar.enYuksekPompaGucu - ayar.enDusukPompaGucu));
  }

  function durumBul(sicaklik, tahmin, pompaGucu, ariza) {
    if (ariza) return "SENSÖR ARIZASI";
    if (sicaklik >= ayar.alarmSicakligi) return "ALARM";
    if (pompaGucu > 0 && sicaklik < ayar.pompaAcmaSicakligi && tahmin > sicaklik) return "ERKEN SOĞUTMA";
    if (pompaGucu > 0) return "SOĞUTMA";
    return "NORMAL";
  }

  function klasikOlustur() {
    return { pompaCalisiyor: false };
  }

  function klasikAdim(k, f) {
    const sicaklik = sicaklikOku(f);
    const ariza = sensorArizali(sicaklik);
    let pompaGucu;
    if (ariza) {
      pompaGucu = ayar.enYuksekPompaGucu;
    } else {
      pompaGucu = pompaGucuHesapla(k, sicaklik);
    }
    return { sicaklik, tahmin: sicaklik, pompaGucu, ariza, durum: durumBul(sicaklik, sicaklik, pompaGucu, ariza) };
  }

  function mlOlustur() {
    return {
      gecmisSicaklik: new Array(ayar.gecmisBoyutu).fill(0),
      gecmisEgim: new Array(ayar.gecmisBoyutu).fill(0),
      gecmisPompa: new Array(ayar.gecmisBoyutu).fill(0),
      gecmisSirasi: 0,
      kayitSayisi: 0,
      agirlikEgim: 0.0,
      agirlikPompa: 0.0,
      agirlikSabit: 0.0,
      yumusakSicaklik: 0.0,
      pompaOrani: 0.0,
      ilkOlcum: true,
      pompaCalisiyor: false,
      sonHata: 0.0
    };
  }

  function sicaklikYumusat(m, sicaklik) {
    if (m.ilkOlcum) {
      m.yumusakSicaklik = sicaklik;
      m.ilkOlcum = false;
    } else {
      m.yumusakSicaklik = m.yumusakSicaklik + ayar.yumusatma * (sicaklik - m.yumusakSicaklik);
    }
    return m.yumusakSicaklik;
  }

  function egimHesapla(m, sicaklik) {
    if (m.kayitSayisi < ayar.gecmisBoyutu) {
      return 0.0;
    }
    const eskiSira = (m.gecmisSirasi + ayar.gecmisBoyutu - ayar.egimAraligi) % ayar.gecmisBoyutu;
    return sicaklik - m.gecmisSicaklik[eskiSira];
  }

  function degisimTahminEt(m, egim, pompa) {
    return m.agirlikEgim * egim + m.agirlikPompa * pompa + m.agirlikSabit;
  }

  function modeliEgit(m, sicaklik) {
    if (m.kayitSayisi < ayar.gecmisBoyutu) {
      return;
    }
    const eskiEgim = m.gecmisEgim[m.gecmisSirasi];
    const eskiPompa = m.gecmisPompa[m.gecmisSirasi];
    const gercekDegisim = sicaklik - m.gecmisSicaklik[m.gecmisSirasi];
    const hata = gercekDegisim - degisimTahminEt(m, eskiEgim, eskiPompa);
    m.agirlikEgim += ayar.ogrenmeHizi * hata * eskiEgim;
    m.agirlikPompa += ayar.ogrenmeHizi * hata * eskiPompa;
    m.agirlikSabit += ayar.ogrenmeHizi * hata;
    m.sonHata = hata;
  }

  function gecmiseKaydet(m, sicaklik, egim, pompa) {
    m.gecmisSicaklik[m.gecmisSirasi] = sicaklik;
    m.gecmisEgim[m.gecmisSirasi] = egim;
    m.gecmisPompa[m.gecmisSirasi] = pompa;
    m.gecmisSirasi = (m.gecmisSirasi + 1) % ayar.gecmisBoyutu;
    if (m.kayitSayisi < ayar.gecmisBoyutu) {
      m.kayitSayisi++;
    }
  }

  function gelecekSicaklikTahminEt(m, sicaklik, egim) {
    let degisim = degisimTahminEt(m, egim, m.pompaOrani);
    if (degisim > ayar.enFazlaTahminFarki) {
      degisim = ayar.enFazlaTahminFarki;
    }
    if (degisim < -ayar.enFazlaTahminFarki) {
      degisim = -ayar.enFazlaTahminFarki;
    }
    return sicaklik + degisim;
  }

  function mlAdim(m, f) {
    const hamSicaklik = sicaklikOku(f);
    const ariza = sensorArizali(hamSicaklik);
    let sicaklik = hamSicaklik;
    let tahmin = hamSicaklik;
    let pompaGucu;
    if (ariza) {
      pompaGucu = ayar.enYuksekPompaGucu;
    } else {
      sicaklik = sicaklikYumusat(m, hamSicaklik);
      const egim = egimHesapla(m, sicaklik);
      modeliEgit(m, sicaklik);
      gecmiseKaydet(m, sicaklik, egim, m.pompaOrani);
      tahmin = gelecekSicaklikTahminEt(m, sicaklik, egim);
      let kararSicakligi = sicaklik;
      if (tahmin > kararSicakligi) {
        kararSicakligi = tahmin;
      }
      pompaGucu = pompaGucuHesapla(m, kararSicakligi);
    }
    m.pompaOrani = pompaGucu / ayar.enYuksekPompaGucu;
    return { sicaklik, tahmin, pompaGucu, ariza, durum: durumBul(sicaklik, tahmin, pompaGucu, ariza) };
  }

  function saniyeIlerlet(f, kontrol, adim) {
    for (let i = 0; i < 10; i++) {
      fizikAdimi(f, 0.1);
    }
    const sonuc = adim(kontrol, f);
    f.pompaPwm = sonuc.pompaGucu;
    return sonuc;
  }

  const disari = { ayar, fizikOlustur, klasikOlustur, klasikAdim, mlOlustur, mlAdim, saniyeIlerlet };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = disari;
  } else {
    kok.Sogutma = disari;
  }
})(typeof window !== "undefined" ? window : globalThis);
