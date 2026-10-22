# Ortak Masraf & Harcama Takip Uygulaması 💳

Denizer, Çağrı, Salia ve Selda için tasarlanmış modern, sade ve pratik ortak harcama, masraf ve bakiye takip sistemi.

---

## 🌟 Öne Çıkan Özellikler

1. **Üst Özet Kartları:**
   - **Denizer, Çağrı, Salia ve Selda**'nın ayrı kartları.
   - Her birinin toplam yaptığı harcama ve **Net Alacak / Borç** durumu (🟢 Alacaklı / 🔴 Borçlu / ⚪ Dengede).
   - Toplam grup masrafı ve kişi başı eşit düşen pay.

2. **💡 "Kim Kime Ne Kadar Ödemeli?" (Otomatik Kolay Hesaplaşma):**
   - Borçları en az transferle kapatacak akıllı mahsuplaşma algoritması (Örn: *Selda ➜ Çağrı'ya 710,00 ₺*).

3. **🔒 Güvenli Değiştirme (PIN Koruması):**
   - **Herkes tüm harcamaları ve bakiyeleri görebilir.**
   - Bir harcamayı **yalnızca harcamayı yapan kişi** kendi 4 haneli PIN koduyla düzenleyebilir veya silebilir.
   - Başlangıç varsayılan PIN kodu: `1234` (Üstteki kilit butonundan her kişi kendi PIN'ini kolayca değiştirebilir).

4. **📱 Telefon Uyumlu (PWA / Mobil Uygulama Hissi):**
   - Safari veya Chrome'da açıp **"Ana Ekrana Ekle" (Add to Home Screen)** diyerek telefonda gerçek bir uygulama gibi kullanılabilir.
   - Excel / CSV formatında tek tıkla dışa aktarma desteği.

---

## 🚀 Nasıl Çalıştırılır?

Proje dizininde terminali açıp:

```bash
# Bağımlılıkları yükleyin (ilk sefer için)
npm install

# Sunucuyu başlatın
npm start
```

Tarayıcınızda açın:
👉 **`http://localhost:3000`**

---

## 🌐 İnternet Üzerinde Link Olarak Paylaşma Seçenekleri

### 1. Seçenek: Anında Canlı İnternet Linki (Sıfır Kurulum)
Bilgisayarınız açıkken telefonlardan veya arkadaşlarınızdan anında erişmek için:

```bash
npm run share
```
Terminalde size özel bir `https://xxxxx.loca.lt` linki verilir. Bu linki gruba attığınız anda herkes kendi telefonundan girip harcamalarını ekleyebilir!

### 2. Seçenek: Aynı Wi-Fi Üzerinden (Ev / Ofis)
Aynı kablosuz ağa bağlı olduğunuzda bilgisayarınızın yerel IP adresiyle telefonunuzdan doğrudan bağlanabilirsiniz:
Örn: `http://192.168.68.103:3000`

### 3. Seçenek: 7/24 Kesintisiz Ücretsiz Bulut Dağıtımı (Render.com / Railway)
Bilgisayarınız kapalıyken de sürekli internette açık kalması için:
1. Bu klasörü GitHub hesabınıza yükleyin.
2. [Render.com](https://render.com) üzerinde ücretsiz bir "Web Service" oluşturup reponuzu bağlayın.
3. Build Command: `npm install`, Start Command: `npm start`
4. Size ömür boyu ücretsiz `https://harcama-takip.onrender.com` şeklinde sabit bir link verir!

---

## 📁 Dosya Yapısı

- `server.js`: Node.js & Express arka yüzü, bakiye hesaplama ve PIN doğrulama motoru.
- `data/database.json`: Harcamaların ve kişilerin kalıcı olarak saklandığı veritabanı.
- `public/index.html`: Modern, temiz ve duyarlı kullanıcı arayüzü.
- `public/index.css`: Şık karanlık tema ve mobil kart tasarımları.
- `public/app.js`: Canlı bakiye hesapları, filtreleme, arama ve modal yönetimi.
- `public/manifest.json`: Mobil ana ekrana ekleme (PWA) desteği.
