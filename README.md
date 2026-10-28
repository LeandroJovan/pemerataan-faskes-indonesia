# Pemerataan Fasilitas Pelayanan Kesehatan Indonesia

Analisis dan visualisasi data persebaran fasilitas pelayanan kesehatan (faskes) di seluruh provinsi di Indonesia.

## Struktur Proyek

```
pemerataan-faskes-indonesia/
│
├── README.md
├── LICENSE
├── .gitignore
├── requirements.txt
│
├── data/
│   ├── raw/                          # Data asli, JANGAN diedit
│   │   ├── penduduk_provinsi_2026.csv
│   │   ├── desa_kelurahan_provinsi_2025.csv
│   │   ├── desa_kelurahan_sarana_kesehatan_2025.csv
│   │   └── rs_puskesmas_provinsi_2025.csv
│   ├── interim/                      # Data setengah jadi (setelah dibersihkan)
│   ├── processed/                    # Data final siap analisis
│   │   └── faskes_master.csv
│   └── README.md                     # Kamus data & sumber (BPS/Kemenkes)
│
├── notebooks/
│   ├── 01_data_understanding.ipynb   # Eksplorasi awal tiap file
│   ├── 02_data_cleaning.ipynb        # Standarisasi nama provinsi, missing value
│   ├── 03_feature_engineering.ipynb  # Hitung rasio & indikator pemerataan
│   ├── 04_eda_visualisasi.ipynb      # Analisis & grafik
│   └── 05_analisis_kesenjangan.ipynb # Index, ranking, clustering
│
├── src/
│   ├── __init__.py
│   ├── config.py                     # Path, konstanta
│   ├── data_loader.py                # Fungsi baca CSV
│   ├── cleaning.py                   # Fungsi pembersihan
│   ├── features.py                   # Perhitungan indikator
│   ├── metrics.py                    # Gini, indeks pemerataan, dll.
│   └── visualization.py              # Fungsi plotting
│
├── outputs/
│   ├── figures/                      # Grafik (png/svg)
│   ├── tables/                       # Tabel hasil (ranking provinsi, dll.)
│   └── maps/                         # Peta choropleth (opsional)
│
├── reports/
│   └── laporan_akhir.md              # Ringkasan temuan & rekomendasi
│
├── dashboard/                        # Opsional (Streamlit)
│   └── app.py
│
└── tests/
    └── test_cleaning.py
```
