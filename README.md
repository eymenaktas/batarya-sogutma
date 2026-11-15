# Batarya Soğutma

Elektrikli araç bataryasının sıcaklığını ölçüp soğutma pompasını otomatik ayarlayan iki Arduino kodu.

**Deneme ortamı:** https://akts.tr/sogutma/

| Sürüm | Dosya | Ne yapar |
|---|---|---|
| Klasik | [`klasik/klasik.ino`](klasik/klasik.ino) | Şu anki sıcaklığa göre pompayı açar, kapatır ve gücünü ayarlar |
| Makine öğrenmeli | [`ml/ml.ino`](ml/ml.ino) | Aynı kurallar, ek olarak 20 saniye sonraki sıcaklığı tahmin edip pompayı erkenden çalıştırır |

## Bağlantılar (Arduino Uno)

| Parça | Pin |
|---|---|
| LM35 sıcaklık sensörü | A0 |
| Pompa (MOSFET üzerinden, PWM) | 9 |
| Buzzer | 8 |
| Yeşil LED | 4 |
| Kırmızı LED | 7 |

Pompa doğrudan Arduino pinine bağlanmaz. Araya bir N kanal MOSFET (örneğin IRLZ44N) ve pompa uçlarına ters bir diyot konur.

## Klasik sürüm nasıl çalışır

1. Saniyede bir, sensörden 10 ölçüm alıp ortalamasını hesaplar.
2. Sıcaklık 30 °C'ye çıkınca pompayı açar, 27 °C'ye inince kapatır. Aradaki 3 derecelik boşluk pompanın sürekli açılıp kapanmasını önler.
3. Pompa açıkken sıcaklık arttıkça gücü de artar, 45 °C'de tam güce ulaşır.
4. 55 °C'de alarm verir: kırmızı LED yanar, buzzer öter.
5. Sensör koparsa ya da saçma bir değer okursa pompayı tam güçte çalıştırır ve alarm verir.

## Makine öğrenmeli sürüm nasıl çalışır

Klasik sürümün bütün kuralları geçerli. Üstüne küçük bir model eklenir:

```
tahmini değişim = agirlikEgim × eğim + agirlikPompa × pompa + agirlikSabit
```

- **eğim:** sıcaklığın son 5 saniyede ne kadar değiştiği
- **pompa:** pompanın o anki gücü (0 ile 1 arası)

Kart her saniye o anki durumu hafızasına yazar. 20 saniye sonra gerçek sıcaklığı gördüğünde eski tahminiyle karşılaştırır ve üç ağırlığı hatayı azaltacak yönde biraz değiştirir. Ağırlıklar sıfırdan başlar, yani kart bataryayı çalışırken kendi kendine tanır.

Pompa gücü, şu anki sıcaklık ile tahmin edilen sıcaklıktan hangisi büyükse ona göre ayarlanır. Böylece batarya hızla ısınmaya başladığında pompa beklemeden devreye girer.

## Ölçülen fark

`test/` klasöründeki düzenek iki `.ino` dosyasını bilgisayarda derleyip aynı batarya modeliyle çalıştırır. 50 saniye tam yük, 190 saniye dinlenme döngüsünde, 20 °C ortamda, model öğrendikten sonra:

| | Klasik | Makine öğrenmeli |
|---|---|---|
| En yüksek sıcaklık | 34,1 °C | 33,3 °C |
| 32 °C üstünde geçen süre (40 dakikada) | 325 sn | 208 sn |
| Ortalama pompa gücü | %18,4 | %19,8 |

Uzun süren sabit yükte iki sürüm aynı sıcaklığa oturur; tahminin faydası ani ısınmalarda görülür.

Batarya modeli basitleştirilmiştir, gerçek bir bataryada sayılar farklı çıkar.

## Test

```
./test/calistir.sh
```

Düzenek ayrıca deneme ortamındaki JavaScript kopyasının Arduino koduyla aynı sonucu verdiğini ve sensör koptuğunda pompanın tam güce çıktığını denetler.

Kodlar `arduino-cli` ile derlenerek de denendi. Sıcaklık formülü 5 V ve 10 bit ölçüm yapan Arduino Uno içindir; başka bir kartta `sicaklikOku` içindeki çarpan değiştirilmelidir.
