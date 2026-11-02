"""
Konfigurasi Path dan Konstanta Proyek Pemerataan Faskes Indonesia
"""

from pathlib import Path

# Base Paths
SRC_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SRC_DIR.parent

# Data Paths
DATA_DIR = PROJECT_ROOT / "data"
RAW_DATA_DIR = DATA_DIR / "raw"
INTERIM_DATA_DIR = DATA_DIR / "interim"
PROCESSED_DATA_DIR = DATA_DIR / "processed"

# Raw File Paths
FILE_PENDUDUK = RAW_DATA_DIR / "penduduk_provinsi_2026.csv"
FILE_DESA = RAW_DATA_DIR / "desa_kelurahan_provinsi_2025.csv"
FILE_SARANA_DESA = RAW_DATA_DIR / "desa_kelurahan_sarana_kesehatan_2025.csv"
FILE_RS_PUSKESMAS = RAW_DATA_DIR / "rs_puskesmas_provinsi_2025.csv"
FILE_GEOJSON_ADM2 = RAW_DATA_DIR / "geoBoundaries-IDN-ADM2_simplified.geojson"

# Interim Cleaned File Paths
INTERIM_PENDUDUK = INTERIM_DATA_DIR / "penduduk_clean.csv"
INTERIM_DESA = INTERIM_DATA_DIR / "desa_clean.csv"
INTERIM_SARANA_DESA = INTERIM_DATA_DIR / "sarana_desa_clean.csv"
INTERIM_RS_PUSKESMAS = INTERIM_DATA_DIR / "rs_puskesmas_clean.csv"
INTERIM_MERGED = INTERIM_DATA_DIR / "faskes_interim_clean.csv"

# Processed Master File
FILE_FASKES_MASTER = PROCESSED_DATA_DIR / "faskes_master.csv"

# Output Paths
OUTPUTS_DIR = PROJECT_ROOT / "outputs"
FIGURES_DIR = OUTPUTS_DIR / "figures"
TABLES_DIR = OUTPUTS_DIR / "tables"
MAPS_DIR = OUTPUTS_DIR / "maps"
REPORTS_DIR = PROJECT_ROOT / "reports"

# Visual Style Settings
PLOT_CONFIG = {
    "dpi": 300,
    "style": "whitegrid",
    "palette_primary": "#1f77b4",
    "palette_secondary": "#ff7f0e",
    "palette_diverging": "RdYlGn_r",
    "font_scale": 1.1,
}

# Standar 38 Provinsi Indonesia (Pasca Pemekaran DOB Papua)
PROVINSI_RESMI_38 = [
    "Aceh", "Sumatera Utara", "Sumatera Barat", "Riau", "Jambi",
    "Sumatera Selatan", "Bengkulu", "Lampung", "Kepulauan Bangka Belitung",
    "Kepulauan Riau", "DKI Jakarta", "Jawa Barat", "Jawa Tengah",
    "DI Yogyakarta", "Jawa Timur", "Banten", "Bali", "Nusa Tenggara Barat",
    "Nusa Tenggara Timur", "Kalimantan Barat", "Kalimantan Tengah",
    "Kalimantan Selatan", "Kalimantan Timur", "Kalimantan Utara",
    "Sulawesi Utara", "Sulawesi Tengah", "Sulawesi Selatan",
    "Sulawesi Tenggara", "Gorontalo", "Sulawesi Barat", "Maluku",
    "Maluku Utara", "Papua Barat", "Papua Barat Daya", "Papua",
    "Papua Selatan", "Papua Tengah", "Papua Pegunungan"
]

# Token representasi nilai hilang (Missing Values) pada data mentah BPS / Kemenkes
MISSING_TOKENS = {"\ufffd", "-", "\u2013", "\u2014", "", "NA", "N/A", "n/a", "None", "nan", "null"}

# Baris non-provinsi yang wajib difilter
DROP_ROWS = {"Indonesia", "Keterangan"}

# Mapping Nama Kolom ke Standar snake_case
COL_MAP_PENDUDUK = {
    "Jumlah Penduduk (Ribu)": "jumlah_penduduk_ribu",
    "Laju Pertumbuhan Penduduk per Tahun": "laju_pertumbuhan_tahunan_persen",
    "Persentase Penduduk": "persentase_penduduk_nasional",
    "Kepadatan Penduduk per km persegi (Km2)": "kepadatan_penduduk_km2",
    "Rasio Jenis Kelamin Penduduk": "rasio_jenis_kelamin",
}

COL_MAP_DESA = {
    "Jumlah Desa": "jumlah_desa",
}

COL_MAP_SARANA_DESA = {
    "Desa/Kelurahan Yang Memiliki Sarana Kesehatan - Rumah Sakit": "desa_memiliki_rs",
    "Desa/Kelurahan Yang Memiliki Sarana Kesehatan - Puskesmas": "desa_memiliki_puskesmas",
    "Desa/Kelurahan Yang Memiliki Sarana Kesehatan - Puskesmas Pembantu": "desa_memiliki_pustu",
    "Desa/Kelurahan Yang Memiliki Sarana Kesehatan - Apotek": "desa_memiliki_apotek",
    "Desa/Kelurahan Yang Memiliki Sarana Kesehatan - Klinik Utama (Unit)": "desa_memiliki_klinik_utama",
    "Desa/Kelurahan Yang Memiliki Sarana Kesehatan - Balai Kesehatan": "desa_memiliki_balai_kesehatan",
    "Desa/Kelurahan Yang Memiliki Sarana Kesehatan - Klinik Pratama": "desa_memiliki_klinik_pratama",
}

COL_MAP_RS_PUSKESMAS = {
    "Jumlah Rumah Sakit Umum": "jumlah_rs_umum",
    "Jumlah Rumah Sakit Khusus": "jumlah_rs_khusus",
    "Jumlah Puskesmas Rawat Inap": "jumlah_puskesmas_rawat_inap",
    "Jumlah Puskesmas Non Rawat Inap": "jumlah_puskesmas_non_rawat_inap",
}
