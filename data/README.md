# Kamus Data & Dokumentasi Sumber (Data Dictionary)

Repositori ini memuat data terkait persebaran fasilitas pelayanan kesehatan (faskes), sarana kesehatan per desa/kelurahan, dan kependudukan di seluruh provinsi di Indonesia.

---

## 1. Struktur Direktori Data

```
data/
├── raw/                          # Data mentah/asli langsung dari BPS/Kemenkes (READ-ONLY)
│   ├── penduduk_provinsi_2026.csv
│   ├── desa_kelurahan_provinsi_2025.csv
│   ├── desa_kelurahan_sarana_kesehatan_2025.csv
│   └── rs_puskesmas_provinsi_2025.csv
├── interim/                      # Data transisi (hasil pembersihan/standarisasi nama provinsi)
└── processed/                    # Data master gabungan siap analisis
    └── faskes_master.csv
```

---

## 2. Sumber Data (Data Sources)

1. **Badan Pusat Statistik (BPS Indonesia)**
   - Proyeksi dan Indikator Kependudukan Menurut Provinsi, 2026.
   - Statistik Potensi Desa (Podes) / Jumlah Desa/Kelurahan Menurut Provinsi, 2025.
   - Desa/Kelurahan yang Memiliki Sarana Kesehatan Menurut Provinsi, 2025.
2. **Kementerian Kesehatan Republik Indonesia (Kemenkes RI) & BPS**
   - Data Rumah Sakit Umum, Rumah Sakit Khusus, Puskesmas Rawat Inap, dan Non Rawat Inap, 2025.

---

## 3. Kamus Data Mentah (`data/raw/`)

### A. `penduduk_provinsi_2026.csv`
Data proyeksi dan karakteristik kependudukan per provinsi tahun 2026.
- `Provinsi`: Nama provinsi di Indonesia.
- `Jumlah Penduduk (Ribu)`: Total estimasi populasi penduduk (satuan: ribu jiwa).
- `Laju Pertumbuhan Penduduk per Tahun`: Persentase laju pertumbuhan tahunan (%).
- `Persentase Penduduk`: Proporsi penduduk provinsi terhadap total penduduk nasional (%).
- `Kepadatan Penduduk per km persegi (Km2)`: Jumlah jiwa per kilometer persegi.
- `Rasio Jenis Kelamin Penduduk`: Rasio laki-laki per 100 perempuan.

### B. `desa_kelurahan_provinsi_2025.csv`
Total wilayah administratif tingkat desa/kelurahan per provinsi.
- `Provinsi`: Nama provinsi di Indonesia.
- `Jumlah Desa`: Jumlah desa dan kelurahan resmi pada provinsi bersangkutan.

### C. `desa_kelurahan_sarana_kesehatan_2025.csv`
Jumlah desa/kelurahan yang telah memiliki akses ke sarana kesehatan tertentu.
- `Provinsi`: Nama provinsi.
- `Desa/Kelurahan Yang Memiliki Sarana Kesehatan - Rumah Sakit`: Jumlah desa/kelurahan dengan RS.
- `Desa/Kelurahan Yang Memiliki Sarana Kesehatan - Puskesmas`: Jumlah desa/kelurahan dengan Puskesmas.
- `Desa/Kelurahan Yang Memiliki Sarana Kesehatan - Puskesmas Pembantu`: Jumlah desa/kelurahan dengan Pustu.
- `Desa/Kelurahan Yang Memiliki Sarana Kesehatan - Apotek`: Jumlah desa/kelurahan dengan Apotek.
- `Desa/Kelurahan Yang Memiliki Sarana Kesehatan - Klinik Utama (Unit)`: Jumlah desa/kelurahan dengan Klinik Utama.
- `Desa/Kelurahan Yang Memiliki Sarana Kesehatan - Balai Kesehatan`: Jumlah desa/kelurahan dengan Balai Kesehatan.
- `Desa/Kelurahan Yang Memiliki Sarana Kesehatan - Klinik Pratama`: Jumlah desa/kelurahan dengan Klinik Pratama.

### D. `rs_puskesmas_provinsi_2025.csv`
Total fasilitas fisik rumah sakit dan puskesmas aktif per provinsi.
- `Provinsi`: Nama provinsi.
- `Jumlah Rumah Sakit Umum`: Jumlah unit RSU yang beroperasi.
- `Jumlah Rumah Sakit Khusus`: Jumlah unit RS Khusus (RSIA, RS Jiwa, RS Mata, dll.).
- `Jumlah Puskesmas Rawat Inap`: Unit Puskesmas berfasilitas rawat inap.
- `Jumlah Puskesmas Non Rawat Inap`: Unit Puskesmas non-rawat inap.

---

## 4. Master Data (`data/processed/faskes_master.csv`)

Tabel analitis gabungan (*denormalized master dataset*) pada level provinsi yang berisi:
- Identitas Provinsi (terstandarisasi).
- Total fasilitas (RSU, RS Khusus, Puskesmas Inap/Non-Inap, Total RS, Total Puskesmas, Total Faskes Primer/Sekunder).
- Indikator Aksesibilitas (Rasio faskes per 100.000 penduduk, Cakupan desa ber-faskes %).
- Indikator Kesenjangan / Kepadatan Relatif.

