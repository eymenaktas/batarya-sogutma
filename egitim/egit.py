import json
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
egitim, test = bolumler < test_baslangic, bolumler >= test_baslangic

model = MLPRegressor(
    hidden_layer_sizes=(GIZLI_SAYISI,),
    activation="relu",
    solver="adam",
    learning_rate_init=0.003,
    batch_size=512,
    max_iter=60,
    tol=1e-6,
    n_iter_no_change=60,
    random_state=7,
)
model.fit(X[egitim], y[egitim])

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
        "kayipEgrisi": [round(float(v), 5) for v in model.loss_curve_],
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
