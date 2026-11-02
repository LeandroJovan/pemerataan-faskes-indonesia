"""
Modul pembaca data (Data Loader):
Menyediakan antarmuka untuk membaca berkas CSV mentah (raw),
data transisi (interim), dan data analitis final (processed).
"""

from pathlib import Path
from typing import Dict, Optional
import pandas as pd
from .config import (
    FILE_PENDUDUK,
    FILE_DESA,
    FILE_SARANA_DESA,
    FILE_RS_PUSKESMAS,
    FILE_FASKES_MASTER,
    INTERIM_PENDUDUK,
    INTERIM_DESA,
    INTERIM_SARANA_DESA,
    INTERIM_RS_PUSKESMAS,
    INTERIM_MERGED,
)


def load_csv_raw(path: Path, **kwargs) -> pd.DataFrame:
    """
    Membaca CSV mentah dengan fallback encoding.
    Default dtype=str agar token teks khusus (seperti '', '-') tidak hilang saat parsing awal.
    """
    encodings = ["utf-8-sig", "utf-8", "latin1", "cp1252"]
    for enc in encodings:
        try:
            return pd.read_csv(path, encoding=enc, dtype=str, keep_default_na=False, **kwargs)
        except (UnicodeDecodeError, LookupError):
            continue
    raise ValueError(f"Gagal membaca file {path} dengan encoding yang didukung.")


def load_raw_penduduk() -> pd.DataFrame:
    """Membaca data mentah kependudukan 2026."""
    return load_csv_raw(FILE_PENDUDUK)


def load_raw_desa() -> pd.DataFrame:
    """Membaca data mentah jumlah desa/kelurahan 2025."""
    return load_csv_raw(FILE_DESA)


def load_raw_sarana_desa() -> pd.DataFrame:
    """Membaca data mentah sarana kesehatan per desa/kelurahan 2025."""
    return load_csv_raw(FILE_SARANA_DESA)


def load_raw_rs_puskesmas() -> pd.DataFrame:
    """Membaca data mentah RS dan Puskesmas 2025."""
    return load_csv_raw(FILE_RS_PUSKESMAS)


def load_all_raw() -> Dict[str, pd.DataFrame]:
    """Membaca seluruh dataset mentah sekaligus ke dalam dictionary."""
    return {
        "penduduk": load_raw_penduduk(),
        "desa": load_raw_desa(),
        "sarana_desa": load_raw_sarana_desa(),
        "rs_puskesmas": load_raw_rs_puskesmas(),
    }


def load_interim_cleaned(name: str = "merged") -> pd.DataFrame:
    """
    Membaca dataset interim yang telah dibersihkan dari folder data/interim/.
    Pilihan name: 'penduduk', 'desa', 'sarana_desa', 'rs_puskesmas', 'merged'.
    """
    mapping = {
        "penduduk": INTERIM_PENDUDUK,
        "desa": INTERIM_DESA,
        "sarana_desa": INTERIM_SARANA_DESA,
        "rs_puskesmas": INTERIM_RS_PUSKESMAS,
        "merged": INTERIM_MERGED,
    }
    if name not in mapping:
        raise ValueError(f"Nama interim tidak dikenali: {name}. Pilihan: {list(mapping.keys())}")
    path = mapping[name]
    if not path.exists():
        raise FileNotFoundError(f"File interim '{name}' belum dibuat di: {path}")
    return pd.read_csv(path)


def load_processed_master(path: Optional[Path] = None) -> pd.DataFrame:
    """Membaca dataset master final dari data/processed/."""
    target_path = path or FILE_FASKES_MASTER
    if not target_path.exists():
        raise FileNotFoundError(f"File master belum ditemukan di: {target_path}")
    return pd.read_csv(target_path)

