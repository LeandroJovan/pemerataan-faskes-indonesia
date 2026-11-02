"""
Unit Test untuk Modul Pembersihan Data (src/cleaning.py)
"""

import sys
from pathlib import Path
import numpy as np
import pandas as pd
import pytest

# Pastikan root repo terbaca di sys.path
REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from src.cleaning import (
    clean_province_name,
    clean_series_numeric,
    clean_penduduk_data,
    clean_desa_data,
    clean_sarana_desa_data,
    clean_rs_puskesmas_data,
    merge_cleaned_datasets,
    validate_cleaning_results,
    run_cleaning_pipeline,
)
from src.config import PROVINSI_RESMI_38


def test_clean_province_name_valid():
    assert clean_province_name("Aceh") == "Aceh"
    assert clean_province_name("  Jawa Barat  ") == "Jawa Barat"
    assert clean_province_name("dki jakarta") == "DKI Jakarta"
    assert clean_province_name("DI Yogyakarta") == "DI Yogyakarta"
    assert clean_province_name("Papua Pegunungan") == "Papua Pegunungan"


def test_clean_province_name_invalid_and_footnotes():
    assert clean_province_name("Indonesia") is None
    assert clean_province_name("Keterangan") is None
    assert clean_province_name("") is None
    assert clean_province_name(None) is None
    assert clean_province_name("1Proyeksi Penduduk Indonesia 2020-2050") is None
    assert clean_province_name("Data Puskesmas berdasarkan Keputusan Menteri Kesehatan") is None


def test_clean_series_numeric():
    raw_s = pd.Series(["10", "25,5", "-", "", "100.2", "NA", ""])
    res = clean_series_numeric(raw_s)
    assert res[0] == 10.0
    assert res[1] == 25.5
    assert np.isnan(res[2])
    assert np.isnan(res[3])
    assert res[4] == 100.2
    assert np.isnan(res[5])
    assert np.isnan(res[6])


def test_clean_penduduk():
    from src.data_loader import load_raw_penduduk

    df_raw = load_raw_penduduk()
    df_clean = clean_penduduk_data(df_raw)

    assert len(df_clean) == 38
    assert "total_penduduk_jiwa" in df_clean.columns
    assert (df_clean["total_penduduk_jiwa"] > 0).all()
    assert set(df_clean["provinsi"]) == set(PROVINSI_RESMI_38)


def test_clean_desa():
    from src.data_loader import load_raw_desa

    df_raw = load_raw_desa()
    df_clean = clean_desa_data(df_raw)

    assert len(df_clean) == 38
    assert (df_clean["jumlah_desa"] > 0).all()
    assert df_clean["jumlah_desa"].dtype == "int64"


def test_clean_sarana_desa():
    from src.data_loader import load_raw_sarana_desa

    df_raw = load_raw_sarana_desa()
    df_clean = clean_sarana_desa_data(df_raw)

    assert len(df_clean) == 38
    assert "balai_kesehatan_is_missing" in df_clean.columns
    # 21 provinsi memiliki missing data balai kesehatan
    assert df_clean["balai_kesehatan_is_missing"].sum() == 21


def test_clean_rs_puskesmas():
    from src.data_loader import load_raw_rs_puskesmas

    df_raw = load_raw_rs_puskesmas()
    df_clean = clean_rs_puskesmas_data(df_raw)

    assert len(df_clean) == 38
    assert "rs_khusus_is_missing" in df_clean.columns
    # Tepat 6 provinsi tidak memiliki data RS Khusus
    assert df_clean["rs_khusus_is_missing"].sum() == 6
    assert (df_clean["total_puskesmas"] > 0).all()
    assert (df_clean["total_rs_est"] >= df_clean["jumlah_rs_umum"]).all()


def test_pipeline_integration_and_validation():
    merged, paths = run_cleaning_pipeline()

    assert len(merged) == 38
    assert paths["merged"].exists()
    assert paths["penduduk"].exists()

    checks = validate_cleaning_results(merged)
    for check_name, passed in checks.items():
        assert passed, f"Pemeriksaan validasi gagal pada: {check_name}"

