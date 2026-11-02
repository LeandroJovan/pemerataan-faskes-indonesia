"""
Modul Pembersihan Data (Data Cleaning Pipeline):
1. Standarisasi dan validasi 38 nama provinsi resmi Indonesia.
2. Filter baris non-wilayah (agregat nasional 'Indonesia', judul, catatan kaki BPS/Kemenkes).
3. Penanganan token khusus / nilai hilang ('\ufffd', '-', 'NA', koma desimal).
4. Pembuatan flag indikator missing value (khususnya RS Khusus dan Balai Kesehatan).
5. Standarisasi penamaan kolom (snake_case).
6. Validasi integritas data & ekspor ke folder data/interim/.
"""

import re
from pathlib import Path
from typing import Dict, Optional, Tuple
import numpy as np
import pandas as pd

from .config import (
    COL_MAP_DESA,
    COL_MAP_PENDUDUK,
    COL_MAP_RS_PUSKESMAS,
    COL_MAP_SARANA_DESA,
    DROP_ROWS,
    INTERIM_DATA_DIR,
    INTERIM_DESA,
    INTERIM_MERGED,
    INTERIM_PENDUDUK,
    INTERIM_RS_PUSKESMAS,
    INTERIM_SARANA_DESA,
    MISSING_TOKENS,
    PROVINSI_RESMI_38,
)


PROVINSI_ALIAS_MAP = {
    "dki jakarta": "DKI Jakarta",
    "daerah khusus ibukota jakarta": "DKI Jakarta",
    "di yogyakarta": "DI Yogyakarta",
    "d.i. yogyakarta": "DI Yogyakarta",
    "daerah istimewa yogyakarta": "DI Yogyakarta",
    "kep. bangka belitung": "Kepulauan Bangka Belitung",
    "kep bangka belitung": "Kepulauan Bangka Belitung",
    "kep. riau": "Kepulauan Riau",
    "kep riau": "Kepulauan Riau",
}


def clean_province_name(name: object) -> Optional[str]:
    """
    Membersihkan dan memvalidasi nama provinsi.
    Mengembalikan None jika baris merupakan catatan kaki atau baris agregat nasional.
    """
    if pd.isna(name):
        return None

    raw_str = str(name).strip()
    if not raw_str or raw_str in DROP_ROWS:
        return None

    # Filter catatan kaki dan keterangan metadata
    if len(raw_str) > 40:
        return None
    if re.match(r"^(\d|keterangan|catatan|data\s+puskesmas|sumber)", raw_str, re.IGNORECASE):
        return None

    normalized = re.sub(r"\s+", " ", raw_str)
    lower = normalized.lower()

    if lower in PROVINSI_ALIAS_MAP:
        return PROVINSI_ALIAS_MAP[lower]

    for official in PROVINSI_RESMI_38:
        if lower == official.lower():
            return official

    return normalized


def is_missing_value(val: object) -> bool:
    """Mengecek apakah nilai merupakan token missing value atau string kosong."""
    if pd.isna(val):
        return True
    s = str(val).strip()
    return s in MISSING_TOKENS or not s


def clean_series_numeric(series: pd.Series, fill_value: Optional[float] = None) -> pd.Series:
    """
    Membersihkan serial data teks menjadi numerik:
    - Menghapus whitespace
    - Mengubah missing tokens ('\ufffd', '-', 'NA', dll.) menjadi NaN
    - Mengonversi koma menjadi titik desimal
    - Melakukan typecast ke float64
    """
    s = series.astype(str).str.strip()
    s_mapped = s.map(lambda x: np.nan if is_missing_value(x) else x.replace(",", "."))
    num = pd.to_numeric(s_mapped, errors="coerce")
    if fill_value is not None:
        num = num.fillna(fill_value)
    return num


def clean_penduduk_data(df_raw: pd.DataFrame) -> pd.DataFrame:
    """
    Pembersihan dataset kependudukan provinsi 2026:
    - Filter 38 provinsi
    - Rename kolom ke snake_case
    - Konversi tipe numerik
    - Hitung populasi riil dalam jiwa (jumlah_penduduk_ribu * 1000)
    """
    df = df_raw.copy()
    df["provinsi"] = df["Provinsi"].apply(clean_province_name)
    df = df.dropna(subset=["provinsi"]).copy()

    # Rename kolom
    for old_col, new_col in COL_MAP_PENDUDUK.items():
        if old_col in df.columns:
            df[new_col] = clean_series_numeric(df[old_col])

    cols_order = [
        "provinsi",
        "jumlah_penduduk_ribu",
        "laju_pertumbuhan_tahunan_persen",
        "persentase_penduduk_nasional",
        "kepadatan_penduduk_km2",
        "rasio_jenis_kelamin",
    ]
    existing_cols = [c for c in cols_order if c in df.columns]
    res = df[existing_cols].copy()

    # Hitung penduduk riil dalam satuan jiwa
    if "jumlah_penduduk_ribu" in res.columns:
        res["total_penduduk_jiwa"] = (res["jumlah_penduduk_ribu"] * 1000).round().astype("int64")

    # Validasi 38 provinsi unik
    res = res.sort_values(by="provinsi").reset_index(drop=True)
    return res


def clean_desa_data(df_raw: pd.DataFrame) -> pd.DataFrame:
    """
    Pembersihan dataset jumlah desa/kelurahan 2025:
    - Filter 38 provinsi
    - Rename ke jumlah_desa dan konversi integer
    """
    df = df_raw.copy()
    df["provinsi"] = df["Provinsi"].apply(clean_province_name)
    df = df.dropna(subset=["provinsi"]).copy()

    if "Jumlah Desa" in df.columns:
        df["jumlah_desa"] = clean_series_numeric(df["Jumlah Desa"]).astype("int64")

    res = df[["provinsi", "jumlah_desa"]].copy()
    res = res.sort_values(by="provinsi").reset_index(drop=True)
    return res


def clean_sarana_desa_data(df_raw: pd.DataFrame) -> pd.DataFrame:
    """
    Pembersihan dataset sarana kesehatan per desa/kelurahan 2025:
    - Filter 38 provinsi
    - Standarisasi nama kolom ke snake_case
    - Identifikasi missing value pada Balai Kesehatan (21 provinsi)
    """
    df = df_raw.copy()
    df["provinsi"] = df["Provinsi"].apply(clean_province_name)
    df = df.dropna(subset=["provinsi"]).copy()

    for old_col, new_col in COL_MAP_SARANA_DESA.items():
        if old_col in df.columns:
            if new_col == "desa_memiliki_balai_kesehatan":
                # Balai kesehatan memiliki missing value di 21 provinsi
                df["balai_kesehatan_is_missing"] = df[old_col].apply(is_missing_value)
                df[new_col] = clean_series_numeric(df[old_col], fill_value=0).astype("int64")
            else:
                df[new_col] = clean_series_numeric(df[old_col], fill_value=0).astype("int64")

    cols_order = [
        "provinsi",
        "desa_memiliki_rs",
        "desa_memiliki_puskesmas",
        "desa_memiliki_pustu",
        "desa_memiliki_apotek",
        "desa_memiliki_klinik_utama",
        "desa_memiliki_balai_kesehatan",
        "desa_memiliki_klinik_pratama",
        "balai_kesehatan_is_missing",
    ]
    existing_cols = [c for c in cols_order if c in df.columns]
    res = df[existing_cols].copy()
    res = res.sort_values(by="provinsi").reset_index(drop=True)
    return res


def clean_rs_puskesmas_data(df_raw: pd.DataFrame) -> pd.DataFrame:
    """
    Pembersihan dataset Rumah Sakit dan Puskesmas 2025:
    - Filter 38 provinsi
    - Penanganan missing value RS Khusus (6 provinsi: Kaltara & 5 provinsi Papua)
    - Pembuatan kolom flag 'rs_khusus_is_missing'
    - Pembuatan 'jumlah_rs_khusus_imputed' (asumsi 0 untuk estimasi agregat)
    - Penghitungan total_rs (dengan NaN) dan total_rs_est (dengan imputasi 0)
    - Penghitungan total_puskesmas
    """
    df = df_raw.copy()
    df["provinsi"] = df["Provinsi"].apply(clean_province_name)
    df = df.dropna(subset=["provinsi"]).copy()

    # RSU, Puskesmas RI, Puskesmas Non-RI
    df["jumlah_rs_umum"] = clean_series_numeric(df["Jumlah Rumah Sakit Umum"], fill_value=0).astype("int64")
    df["jumlah_puskesmas_rawat_inap"] = clean_series_numeric(
        df["Jumlah Puskesmas Rawat Inap"], fill_value=0
    ).astype("int64")
    df["jumlah_puskesmas_non_rawat_inap"] = clean_series_numeric(
        df["Jumlah Puskesmas Non Rawat Inap"], fill_value=0
    ).astype("int64")

    # RS Khusus (memiliki nilai hilang di 6 provinsi)
    df["rs_khusus_is_missing"] = df["Jumlah Rumah Sakit Khusus"].apply(is_missing_value)
    df["jumlah_rs_khusus"] = clean_series_numeric(df["Jumlah Rumah Sakit Khusus"])
    df["jumlah_rs_khusus_imputed"] = df["jumlah_rs_khusus"].fillna(0).astype("int64")

    # Kalkulasi agregat
    df["total_rs"] = df["jumlah_rs_umum"] + df["jumlah_rs_khusus"]
    df["total_rs_est"] = df["jumlah_rs_umum"] + df["jumlah_rs_khusus_imputed"]
    df["total_puskesmas"] = df["jumlah_puskesmas_rawat_inap"] + df["jumlah_puskesmas_non_rawat_inap"]

    cols_order = [
        "provinsi",
        "jumlah_rs_umum",
        "jumlah_rs_khusus",
        "jumlah_rs_khusus_imputed",
        "rs_khusus_is_missing",
        "total_rs",
        "total_rs_est",
        "jumlah_puskesmas_rawat_inap",
        "jumlah_puskesmas_non_rawat_inap",
        "total_puskesmas",
    ]
    res = df[cols_order].copy()
    res = res.sort_values(by="provinsi").reset_index(drop=True)
    return res


def merge_cleaned_datasets(
    df_penduduk: pd.DataFrame,
    df_desa: pd.DataFrame,
    df_sarana: pd.DataFrame,
    df_rs_pkm: pd.DataFrame,
) -> pd.DataFrame:
    """
    Menggabungkan seluruh dataset interim bersih menjadi satu tabel terpadu level provinsi.
    Memastikan integritas relasi 1-to-1 pada 38 provinsi.
    """
    merged = df_penduduk.merge(df_desa, on="provinsi", how="inner", validate="one_to_one")
    merged = merged.merge(df_rs_pkm, on="provinsi", how="inner", validate="one_to_one")
    merged = merged.merge(df_sarana, on="provinsi", how="inner", validate="one_to_one")

    if len(merged) != len(PROVINSI_RESMI_38):
        raise ValueError(
            f"Jumlah baris hasil gabungan ({len(merged)}) tidak sesuai standar 38 provinsi!"
        )

    return merged


def validate_cleaning_results(df_merged: pd.DataFrame) -> Dict[str, bool]:
    """
    Menjalankan serangkaian pemeriksaan kualitas data (quality checks) terhadap data hasil pembersihan.
    """
    checks = {
        "is_exactly_38_provinces": len(df_merged) == 38,
        "no_duplicate_provinces": df_merged["provinsi"].duplicated().sum() == 0,
        "all_official_provinces_present": set(df_merged["provinsi"]) == set(PROVINSI_RESMI_38),
        "no_negative_population": (df_merged["total_penduduk_jiwa"] > 0).all(),
        "no_negative_villages": (df_merged["jumlah_desa"] > 0).all(),
        "no_negative_puskesmas": (df_merged["total_puskesmas"] > 0).all(),
        "no_negative_rsu": (df_merged["jumlah_rs_umum"] >= 0).all(),
    }
    return checks


def save_interim_datasets(
    df_penduduk: pd.DataFrame,
    df_desa: pd.DataFrame,
    df_sarana: pd.DataFrame,
    df_rs_pkm: pd.DataFrame,
    df_merged: pd.DataFrame,
    output_dir: Optional[Path] = None,
) -> Dict[str, Path]:
    """
    Menyimpan seluruh dataset interim yang telah dibersihkan ke direktori data/interim/.
    """
    target_dir = output_dir or INTERIM_DATA_DIR
    target_dir.mkdir(parents=True, exist_ok=True)

    paths = {
        "penduduk": target_dir / "penduduk_clean.csv",
        "desa": target_dir / "desa_clean.csv",
        "sarana_desa": target_dir / "sarana_desa_clean.csv",
        "rs_puskesmas": target_dir / "rs_puskesmas_clean.csv",
        "merged": target_dir / "faskes_interim_clean.csv",
    }

    df_penduduk.to_csv(paths["penduduk"], index=False)
    df_desa.to_csv(paths["desa"], index=False)
    df_sarana.to_csv(paths["sarana_desa"], index=False)
    df_rs_pkm.to_csv(paths["rs_puskesmas"], index=False)
    df_merged.to_csv(paths["merged"], index=False)

    return paths


def run_cleaning_pipeline() -> Tuple[pd.DataFrame, Dict[str, Path]]:
    """
    Orkestrasi alur pembersihan data dari raw hingga tersimpan di interim/.
    """
    from .data_loader import load_all_raw

    raw_data = load_all_raw()
    c_penduduk = clean_penduduk_data(raw_data["penduduk"])
    c_desa = clean_desa_data(raw_data["desa"])
    c_sarana = clean_sarana_desa_data(raw_data["sarana_desa"])
    c_rs_pkm = clean_rs_puskesmas_data(raw_data["rs_puskesmas"])

    merged = merge_cleaned_datasets(c_penduduk, c_desa, c_sarana, c_rs_pkm)
    validation = validate_cleaning_results(merged)

    if not all(validation.values()):
        failed = [k for k, v in validation.items() if not v]
        raise ValueError(f"Validasi pembersihan gagal pada: {failed}")

    saved_paths = save_interim_datasets(c_penduduk, c_desa, c_sarana, c_rs_pkm, merged)
    return merged, saved_paths
