import copy
import json
import os
import time
from pathlib import Path

import numpy as np
import onnx
import onnxruntime
from onnx import TensorProto, helper, numpy_helper
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.neural_network import MLPRegressor

KOK = Path(__file__).resolve().parent.parent
TAHMIN_SURESI = 20
GIZLI_SAYISI = 8
EGITIM_SURESI = float(os.environ.get("EGITIM_SURESI", "1800"))

veri = np.loadtxt(KOK / "egitim" / "veri.csv", delimiter=",", skiprows=1)
bolum, saniye = veri[:, 0].astype(int), veri[:, 1].astype(int)
girdiler, sicaklik = veri[:, 2:5], veri[:, 5]

gelecek = np.roll(sicaklik, -TAHMIN_SURESI)
ayni_bolum = np.roll(bolum, -TAHMIN_SURESI) == bolum
gecerli = ayni_bolum & (saniye > 5)
gecerli[-TAHMIN_SURESI:] = False

X = girdiler[gecerli].astype(np.float32)
y = (gelecek - sicaklik)[gecerli].astype(np.float32)
bolumler = bolum[gecerli]

test_baslangic = int(bolumler.max() * 0.8)
dogrulama_baslangic = int(bolumler.max() * 0.7)
egitim = bolumler < dogrulama_baslangic
dogrulama = (bolumler >= dogrulama_baslangic) & (bolumler < test_baslangic)
test = bolumler >= test_baslangic

model = MLPRegressor(
    hidden_layer_sizes=(GIZLI_SAYISI,),
    activation="relu",
    solver="adam",
    learning_rate_init=0.003,
    batch_size=1024,
    random_state=7,
)
X_egitim, y_egitim = X[egitim], y[egitim]
X_dogrulama, y_dogrulama = X[dogrulama], y[dogrulama]

baslangic = time.time()
en_iyi_hata = float("inf")
en_iyi_agirlik = None
en_iyi_tur = 0
sabir = 0
tur = 0
ogrenme_hizi = 0.003
egri = []
while time.time() - baslangic < EGITIM_SURESI:
    model.partial_fit(X_egitim, y_egitim)
    tur += 1
    hata = float(mean_absolute_error(y_dogrulama, model.predict(X_dogrulama)))
    gecen = time.time() - baslangic
    egri.append((gecen / 60, hata, float(model.loss_)))
    if hata < en_iyi_hata - 1e-5:
        en_iyi_hata = hata
        en_iyi_agirlik = (copy.deepcopy(model.coefs_), copy.deepcopy(model.intercepts_))
        en_iyi_tur = tur
        sabir = 0
    else:
        sabir += 1
        if sabir >= 40 and ogrenme_hizi > 1e-5:
            ogrenme_hizi /= 2
            model._optimizer.learning_rate = ogrenme_hizi
            sabir = 0
    if tur % 25 == 0:
        print(f"{gecen / 60:5.1f} dk | tur {tur} | dogrulama {hata:.4f} | en iyi {en_iyi_hata:.4f} (tur {en_iyi_tur}) | hiz {ogrenme_hizi:.2e}", flush=True)

model.coefs_, model.intercepts_ = en_iyi_agirlik
print(f"bitti: {tur} tur, en iyi tur {en_iyi_tur}, dogrulama {en_iyi_hata:.4f}", flush=True)

def temizle(d):
    d = d.astype(np.float32)
    d[np.abs(d) < 1e-20] = 0
    return d


gizli_agirlik = temizle(model.coefs_[0].T)
gizli_sabit = temizle(model.intercepts_[0])
cikis_agirlik = temizle(model.coefs_[1].T)
cikis_sabit = temizle(model.intercepts_[1])


def elle_hesapla(x):
    gizli = np.maximum(x @ gizli_agirlik.T + gizli_sabit, 0)
    return (gizli @ cikis_agirlik.T + cikis_sabit).ravel()


graf = helper.make_graph(
    [
        helper.make_node("Gemm", ["girdi", "gizliAgirlik", "gizliSabit"], ["gizliHam"], transB=1),
        helper.make_node("Relu", ["gizliHam"], ["gizli"]),
        helper.make_node("Gemm", ["gizli", "cikisAgirlik", "cikisSabiti"], ["degisim"], transB=1),
    ],
    "batarya_sicaklik_tahmini",
    [helper.make_tensor_value_info("girdi", TensorProto.FLOAT, ["adet", 3])],
    [
        helper.make_tensor_value_info("degisim", TensorProto.FLOAT, ["adet", 1]),
        helper.make_tensor_value_info("gizli", TensorProto.FLOAT, ["adet", GIZLI_SAYISI]),
    ],
    [
        numpy_helper.from_array(gizli_agirlik, "gizliAgirlik"),
        numpy_helper.from_array(gizli_sabit, "gizliSabit"),
        numpy_helper.from_array(cikis_agirlik, "cikisAgirlik"),
        numpy_helper.from_array(cikis_sabit, "cikisSabiti"),
    ],
)
onnx_model = helper.make_model(graf, opset_imports=[helper.make_opsetid("", 13)], producer_name="batarya-sogutma")
onnx_model.ir_version = 8
onnx.checker.check_model(onnx_model)
onnx.save(onnx_model, KOK / "site" / "model.onnx")

oturum = onnxruntime.InferenceSession(str(KOK / "site" / "model.onnx"), providers=["CPUExecutionProvider"])
onnx_tahmin = oturum.run(["degisim"], {"girdi": X[test]})[0].ravel()
elle_tahmin = elle_hesapla(X[test])
onnx_farki = float(np.max(np.abs(onnx_tahmin - elle_tahmin)))
assert onnx_farki < 1e-4, onnx_farki


def dizi(d):
    return ", ".join(f"{float(v):.9g}" for v in d)


satirlar = [
    "const int girdiSayisi = 3;",
    f"const int gizliSayisi = {GIZLI_SAYISI};",
    "",
    "const float gizliAgirlik[gizliSayisi][girdiSayisi] = {",
    *["  {" + dizi(satir) + "}," for satir in gizli_agirlik],
    "};",
    "",
    f"const float gizliSabit[gizliSayisi] = {{{dizi(gizli_sabit)}}};",
    "",
    f"const float baslangicCikisAgirlik[gizliSayisi] = {{{dizi(cikis_agirlik.ravel())}}};",
    "",
    f"const float baslangicCikisSabiti = {float(cikis_sabit[0]):.9g};",
    "",
]
(KOK / "ml" / "model.h").write_text("\n".join(satirlar))

mae_model = float(mean_absolute_error(y[test], onnx_tahmin))
mae_sabit = float(mean_absolute_error(y[test], np.zeros_like(y[test])))
mae_duz = float(mean_absolute_error(y[test], X[test][:, 0] * (TAHMIN_SURESI / 5)))
hata = onnx_tahmin - y[test]

rng = np.random.default_rng(3)
secim = rng.choice(len(onnx_tahmin), 400, replace=False)
kenarlar = np.linspace(-3, 3, 25)
sayim, _ = np.histogram(np.clip(hata, -3, 3), bins=kenarlar)
sayim_sabit, _ = np.histogram(np.clip(-y[test], -3, 3), bins=kenarlar)

cikti = {
    "girdiSayisi": 3,
    "gizliSayisi": GIZLI_SAYISI,
    "gizliAgirlik": [[float(v) for v in satir] for satir in gizli_agirlik],
    "gizliSabit": [float(v) for v in gizli_sabit],
    "cikisAgirlik": [float(v) for v in cikis_agirlik.ravel()],
    "cikisSabiti": float(cikis_sabit[0]),
    "egitim": {
        "egitimSatiri": int(egitim.sum()),
        "testSatiri": int(test.sum()),
        "bolumSayisi": int(bolumler.max() + 1),
        "gizliKareOrtalamasi": round(float(np.mean(np.sum(np.maximum(X[test] @ gizli_agirlik.T + gizli_sabit, 0) ** 2, axis=1))), 3),
        "egitimSuresiDakika": round(EGITIM_SURESI / 60, 1),
        "turSayisi": tur,
        "enIyiTur": en_iyi_tur,
        "dogrulamaSatiri": int(dogrulama.sum()),
        "kayipEgrisi": [[round(d, 2), round(h, 4)] for d, h, _ in egri[:: max(1, len(egri) // 180)]],
        "maeModel": round(mae_model, 4),
        "maeSabit": round(mae_sabit, 4),
        "maeDuzCizgi": round(mae_duz, 4),
        "r2": round(float(r2_score(y[test], onnx_tahmin)), 4),
        "onnxFarki": onnx_farki,
        "sacilim": [[round(float(y[test][i]), 3), round(float(onnx_tahmin[i]), 3)] for i in secim],
        "hataKenarlari": [round(float(v), 2) for v in kenarlar],
        "hataSayimi": [int(v) for v in sayim],
        "hataSayimiSabit": [int(v) for v in sayim_sabit],
    },
}
(KOK / "site" / "model.json").write_text(json.dumps(cikti, ensure_ascii=False))

print("egitim satiri:", int(egitim.sum()), "test satiri:", int(test.sum()))
print("MAE model:", round(mae_model, 4), "| hep sifir:", round(mae_sabit, 4), "| duz cizgi:", round(mae_duz, 4), "| R2:", cikti["egitim"]["r2"])
print("ONNX ile elle hesap arasi en buyuk fark:", onnx_farki)
