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
    egimAraligi: 5,
    tahminSuresi: 20,
    sicaklikMerkezi: 25.0,
    sicaklikOlcegi: 10.0,
    yumusatma: 0.3,
    enFazlaTahminFarki: 10.0,
    ogrenmeHizi: 0.002,
    enFazlaHata: 3.0,
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

  function mlOlustur(model, ogrenilen) {
    const kaynak = ogrenilen || model;
    return {
      model,
      cikisAgirlik: kaynak.cikisAgirlik.slice(),
      cikisSabiti: kaynak.cikisSabiti,
      guncellemeSayisi: ogrenilen ? ogrenilen.guncellemeSayisi : 0,
      sicaklikGecmisi: new Array(ayar.egimAraligi).fill(0),
      sicaklikSirasi: 0,
      sicaklikKayitSayisi: 0,
      egitimGirdisi: new Array(ayar.tahminSuresi).fill(null),
      egitimSicakligi: new Array(ayar.tahminSuresi).fill(0),
      egitimSirasi: 0,
      egitimKayitSayisi: 0,
      yumusakSicaklik: 0.0,
      pompaOrani: 0.0,
      ilkOlcum: true,
      pompaCalisiyor: false,
      sonHata: null,
      sonHataBaslangic: null
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
    if (m.sicaklikKayitSayisi < ayar.egimAraligi) {
      return 0.0;
    }
    return sicaklik - m.sicaklikGecmisi[m.sicaklikSirasi];
  }

  function sicaklikKaydet(m, sicaklik) {
    m.sicaklikGecmisi[m.sicaklikSirasi] = sicaklik;
    m.sicaklikSirasi = (m.sicaklikSirasi + 1) % ayar.egimAraligi;
    if (m.sicaklikKayitSayisi < ayar.egimAraligi) {
      m.sicaklikKayitSayisi++;
    }
  }

  function gizliKatmanHesapla(model, girdi) {
    const gizli = new Array(model.gizliSayisi);
    for (let n = 0; n < model.gizliSayisi; n++) {
      let toplam = model.gizliSabit[n];
      for (let g = 0; g < model.girdiSayisi; g++) {
        toplam += model.gizliAgirlik[n][g] * girdi[g];
      }
      if (toplam < 0) {
        toplam = 0;
      }
      gizli[n] = toplam;
    }
    return gizli;
  }

  function cikisHesapla(agirlik, sabit, gizli) {
    let sonuc = sabit;
    for (let n = 0; n < gizli.length; n++) {
      sonuc += agirlik[n] * gizli[n];
    }
    return sonuc;
  }

  function modeliEgit(m, sicaklik, eskiGizli) {
    if (m.egitimKayitSayisi < ayar.tahminSuresi) {
      return;
    }
    const gercekDegisim = sicaklik - m.egitimSicakligi[m.egitimSirasi];
    m.sonHataBaslangic = gercekDegisim - cikisHesapla(m.model.cikisAgirlik, m.model.cikisSabiti, eskiGizli);
    m.sonHata = gercekDegisim - cikisHesapla(m.cikisAgirlik, m.cikisSabiti, eskiGizli);
    let hata = m.sonHata;
    if (hata > ayar.enFazlaHata) {
      hata = ayar.enFazlaHata;
    }
    if (hata < -ayar.enFazlaHata) {
      hata = -ayar.enFazlaHata;
    }
    for (let n = 0; n < eskiGizli.length; n++) {
      m.cikisAgirlik[n] += ayar.ogrenmeHizi * hata * eskiGizli[n];
    }
    m.cikisSabiti += ayar.ogrenmeHizi * hata;
    m.guncellemeSayisi++;
  }

  function egitimeKaydet(m, girdi, sicaklik) {
    m.egitimGirdisi[m.egitimSirasi] = girdi;
    m.egitimSicakligi[m.egitimSirasi] = sicaklik;
    m.egitimSirasi = (m.egitimSirasi + 1) % ayar.tahminSuresi;
    if (m.egitimKayitSayisi < ayar.tahminSuresi) {
      m.egitimKayitSayisi++;
    }
  }

  function mlOlc(m, f) {
    const hamSicaklik = sicaklikOku(f);
    if (sensorArizali(hamSicaklik)) {
      m.sicaklikKayitSayisi = 0;
      m.egitimKayitSayisi = 0;
      m.ilkOlcum = true;
      return { hamSicaklik, ariza: true, sicaklik: hamSicaklik, girdi: null, eskiGirdi: null };
    }
    const sicaklik = sicaklikYumusat(m, hamSicaklik);
    const egim = egimHesapla(m, sicaklik);
    sicaklikKaydet(m, sicaklik);
    const girdi = [egim, m.pompaOrani, (sicaklik - ayar.sicaklikMerkezi) / ayar.sicaklikOlcegi];
    const eskiGirdi = m.egitimKayitSayisi < ayar.tahminSuresi ? null : m.egitimGirdisi[m.egitimSirasi];
    return { hamSicaklik, ariza: false, sicaklik, girdi, eskiGirdi };
  }

  function mlKarar(m, olcum, gizli, eskiGizli) {
    let tahmin = olcum.sicaklik;
    let pompaGucu;
    m.sonHata = null;
    m.sonHataBaslangic = null;
    if (olcum.ariza) {
      pompaGucu = ayar.enYuksekPompaGucu;
    } else {
      if (olcum.eskiGirdi) {
        modeliEgit(m, olcum.sicaklik, eskiGizli);
      }
      egitimeKaydet(m, olcum.girdi, olcum.sicaklik);
      let degisim = cikisHesapla(m.cikisAgirlik, m.cikisSabiti, gizli);
      if (degisim > ayar.enFazlaTahminFarki) {
        degisim = ayar.enFazlaTahminFarki;
      }
      if (degisim < -ayar.enFazlaTahminFarki) {
        degisim = -ayar.enFazlaTahminFarki;
      }
      tahmin = olcum.sicaklik + degisim;
      let kararSicakligi = olcum.sicaklik;
      if (tahmin > kararSicakligi) {
        kararSicakligi = tahmin;
      }
      pompaGucu = pompaGucuHesapla(m, kararSicakligi);
    }
    m.pompaOrani = pompaGucu / ayar.enYuksekPompaGucu;
    return {
      sicaklik: olcum.sicaklik,
      tahmin,
      pompaGucu,
      ariza: olcum.ariza,
      durum: durumBul(olcum.sicaklik, tahmin, pompaGucu, olcum.ariza)
    };
  }

  function mlAdim(m, f) {
    const olcum = mlOlc(m, f);
    if (olcum.ariza) {
      return mlKarar(m, olcum, null, null);
    }
    const gizli = gizliKatmanHesapla(m.model, olcum.girdi);
    const eskiGizli = olcum.eskiGirdi ? gizliKatmanHesapla(m.model, olcum.eskiGirdi) : null;
    return mlKarar(m, olcum, gizli, eskiGizli);
  }

  function fizikIlerlet(f) {
    for (let i = 0; i < 10; i++) {
      fizikAdimi(f, 0.1);
    }
  }

  function saniyeIlerlet(f, kontrol, adim) {
    fizikIlerlet(f);
    const sonuc = adim(kontrol, f);
    f.pompaPwm = sonuc.pompaGucu;
    return sonuc;
  }

  const disari = {
    ayar, fizikOlustur, fizikIlerlet, klasikOlustur, klasikAdim, mlOlustur, mlOlc, mlKarar, mlAdim,
    gizliKatmanHesapla, cikisHesapla, pompaGucuHesapla, saniyeIlerlet
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = disari;
  } else {
    kok.Sogutma = disari;
  }
})(typeof window !== "undefined" ? window : globalThis);
