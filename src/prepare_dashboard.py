from __future__ import annotations

import json
import sys
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.config import INTERIM_MERGED

ADM1 = ROOT / "data" / "raw" / "geoBoundaries-IDN-ADM1_38prov.json"
OUT_DIR = ROOT / "dashboard" / "data"
OUT_JS = OUT_DIR / "dashboard-data.js"
OUT_GEOJSON = OUT_DIR / "indonesia_provinsi.geojson"

PROVINCE_ALIASES = {
    "Daerah Istimewa Yogyakarta": "DI Yogyakarta",
}

COVERAGE_LABELS = {
    "desa_rs": "Rumah Sakit",
    "desa_pkm": "Puskesmas",
    "desa_pustu": "Puskesmas Pembantu",
    "desa_apotek": "Apotek",
    "desa_klinik_utama": "Klinik Utama",
    "desa_balai": "Balai Kesehatan",
    "desa_klinik_pratama": "Klinik Pratama",
}

INTERIM_RENAME = {
    "provinsi": "Provinsi",
    "total_penduduk_jiwa": "pop",
    "jumlah_desa": "Jumlah Desa",
    "kepadatan_penduduk_km2": "Kepadatan Penduduk per km persegi (Km2)",
    "jumlah_rs_umum": "rsu",
    "jumlah_rs_khusus": "rsk",
    "jumlah_puskesmas_rawat_inap": "pkm_ri",
    "jumlah_puskesmas_non_rawat_inap": "pkm_nri",
    "total_rs_est": "total_rs_est",
    "total_puskesmas": "total_pkm",
    "desa_memiliki_rs": "desa_rs",
    "desa_memiliki_puskesmas": "desa_pkm",
    "desa_memiliki_pustu": "desa_pustu",
    "desa_memiliki_apotek": "desa_apotek",
    "desa_memiliki_klinik_utama": "desa_klinik_utama",
    "desa_memiliki_balai_kesehatan": "desa_balai",
    "desa_memiliki_klinik_pratama": "desa_klinik_pratama",
    "rs_khusus_is_missing": "rsk_missing",
    "balai_kesehatan_is_missing": "desa_balai_missing",
}


def gini(values: pd.Series) -> float:
    x = np.sort(values.dropna().to_numpy(dtype=float))
    n = len(x)
    if n == 0 or x.sum() == 0:
        return float("nan")
    return float((2 * np.sum(np.arange(1, n + 1) * x) / (n * np.sum(x))) - (n + 1) / n)


def theil(values: pd.Series) -> float:
    x = values.dropna().to_numpy(dtype=float)
    mu = x.mean()
    return float(np.mean((x / mu) * np.log(x / mu)))


def share_top5(values: pd.Series) -> float:
    return float(values.nlargest(5).sum() / values.sum() * 100)


def load_areas() -> pd.Series:
    geo = gpd.read_file(ADM1)
    geo["name"] = geo["PROVINSI"].replace(PROVINCE_ALIASES)
    areas = geo.to_crs(6933).area / 1e6
    return pd.Series(areas.values, index=geo["name"].values)


def load_master(areas: pd.Series) -> pd.DataFrame:
    df = pd.read_csv(INTERIM_MERGED).rename(columns=INTERIM_RENAME)
    df["Provinsi"] = df["Provinsi"].str.strip()
    df["area_km2"] = df["Provinsi"].map(areas)

    df["total_faskes_est"] = df["total_rs_est"] + df["total_pkm"]
    df["rs_per100k"] = df["total_rs_est"] / df["pop"] * 100_000
    df["pkm_per100k"] = df["total_pkm"] / df["pop"] * 100_000
    df["faskes_per100k"] = df["total_faskes_est"] / df["pop"] * 100_000
    df["rs_per_1000km2"] = df["total_rs_est"] / df["area_km2"] * 1_000
    df["pkm_per_1000km2"] = df["total_pkm"] / df["area_km2"] * 1_000
    df["faskes_per_1000km2"] = df["total_faskes_est"] / df["area_km2"] * 1_000
    df["desa_pkm_pct"] = df["desa_pkm"] / df["Jumlah Desa"] * 100
    df["desa_rs_pct"] = df["desa_rs"] / df["Jumlah Desa"] * 100
    df["pkm_needed"] = df["pop"] / 30_000
    df["pkm_gap"] = df["total_pkm"] - df["pkm_needed"]
    df["pkm_ratio_std"] = df["total_pkm"] / df["pkm_needed"]
    df["rsk_missing"] = df["rsk_missing"].astype(int)
    df["desa_balai_missing"] = df["desa_balai_missing"].astype(int)

    df["kuadran"] = np.select(
        [
            (df.pkm_per100k >= df.pkm_per100k.median()) & (df.desa_pkm_pct >= df.desa_pkm_pct.median()),
            (df.pkm_per100k >= df.pkm_per100k.median()) & (df.desa_pkm_pct < df.desa_pkm_pct.median()),
            (df.pkm_per100k < df.pkm_per100k.median()) & (df.desa_pkm_pct >= df.desa_pkm_pct.median()),
        ],
        [
            "tinggi-tinggi",
            "tinggi per kapita / rendah cakupan",
            "rendah per kapita / tinggi cakupan",
        ],
        default="rendah-rendah",
    )
    df["prioritas"] = df["kuadran"].map({
        "rendah-rendah": "Prioritas primary care",
        "tinggi per kapita / rendah cakupan": "Prioritas akses geografis",
        "rendah per kapita / tinggi cakupan": "Tantangan kepadatan",
        "tinggi-tinggi": "Relatif seimbang",
    })
    df["kekurangan_pkm"] = (df["pkm_needed"] - df["total_pkm"]).clip(lower=0).round(1)
    df["status_std"] = np.where(df["pkm_gap"] >= 0, "Memenuhi", "Belum memenuhi")
    df["rank_pkm_per100k"] = df["pkm_per100k"].rank(ascending=False, method="min").astype(int)
    df["rank_rs_per100k"] = df["rs_per100k"].rank(ascending=False, method="min").astype(int)
    df["rank_cakupan_pkm"] = df["desa_pkm_pct"].rank(ascending=False, method="min").astype(int)
    return df


def build_national(df: pd.DataFrame) -> dict:
    total_desa = int(df["Jumlah Desa"].sum())
    desa_pkm = int(df["desa_pkm"].sum())
    pct_desa_dengan_pkm = round(desa_pkm / total_desa * 100, 2)
    desa_rs = int(df["desa_rs"].sum())
    total_pkm = int(df["total_pkm"].sum())
    total_rs = float(df["total_rs_est"].sum())
    total_rsu = int(df["rsu"].sum())
    total_rsk = int(df["rsk"].fillna(0).sum())
    below_std = int((df["pkm_gap"] < 0).sum())
    return {
        "provinsi": int(len(df)),
        "penduduk": float(df["pop"].sum()),
        "desa": total_desa,
        "puskesmas": total_pkm,
        "rs": total_rs,
        "rsu": total_rsu,
        "rsk": total_rsk,
        "desa_dengan_pkm": desa_pkm,
        "desa_tanpa_pkm": total_desa - desa_pkm,
        "desa_tanpa_rs": total_desa - desa_rs,
        "pct_desa_dengan_pkm": pct_desa_dengan_pkm,
        "pct_desa_tanpa_pkm": round(100 - pct_desa_dengan_pkm, 2),
        "pct_desa_tanpa_rs": (total_desa - desa_rs) / total_desa * 100,
        "provinsi_belum_std": below_std,
        "provinsi_memenuhi_std": len(df) - below_std,
        "median_pkm_per100k": float(df["pkm_per100k"].median()),
        "median_rs_per100k": float(df["rs_per100k"].median()),
        "median_cakupan_pkm": float(df["desa_pkm_pct"].median()),
        "gini_rs_abs": gini(df["total_rs_est"]),
        "gini_pkm_abs": gini(df["total_pkm"]),
        "gini_rs_pc": gini(df["rs_per100k"]),
        "gini_pkm_pc": gini(df["pkm_per100k"]),
        "theil_pkm_pc": theil(df["pkm_per100k"]),
        "top5_share_pop": share_top5(df["pop"]),
        "top5_share_rs": share_top5(df["total_rs_est"]),
        "top5_share_pkm": share_top5(df["total_pkm"]),
    }


def build_coverage(df: pd.DataFrame) -> tuple[dict, dict]:
    total_desa = df.set_index("Provinsi")["Jumlah Desa"]
    national = {}
    for column, label in COVERAGE_LABELS.items():
        jumlah = df[column].sum()
        national[label] = {
            "jumlah": int(jumlah),
            "pct": float(jumlah / total_desa.sum() * 100),
        }

    by_province = {}
    for province, row in df.set_index("Provinsi").iterrows():
        values = {}
        for column, label in COVERAGE_LABELS.items():
            value = row[column]
            values[label] = None if pd.isna(value) else round(float(value / row["Jumlah Desa"] * 100), 2)
        by_province[province] = values
    return national, by_province


def build_geojson(df: pd.DataFrame) -> dict:
    geo = gpd.read_file(ADM1)
    geo["name"] = geo["PROVINSI"].replace(PROVINCE_ALIASES)
    missing = set(df["Provinsi"]) - set(geo["name"])
    if missing:
        raise ValueError(f"Provinsi tidak cocok dengan GeoJSON: {sorted(missing)}")

    metrics = df.set_index("Provinsi")
    geo = geo.merge(
        metrics[[
            "pkm_per100k", "rs_per100k", "desa_pkm_pct", "desa_rs_pct",
            "faskes_per_1000km2", "pkm_ratio_std", "pkm_gap", "kuadran", "prioritas",
        ]],
        left_on="name", right_index=True, how="left",
    )
    geo = geo[["name", "KODE_PROV", "pkm_per100k", "rs_per100k", "desa_pkm_pct",
               "desa_rs_pct", "faskes_per_1000km2", "pkm_ratio_std", "pkm_gap",
               "kuadran", "prioritas", "geometry"]].to_crs(4326)

    feature_collection = json.loads(geo.to_json(drop_id=True))
    for feature in feature_collection["features"]:
        props = feature["properties"]
        for key, value in list(props.items()):
            if isinstance(value, (np.integer,)):
                props[key] = int(value)
            elif isinstance(value, (np.floating,)):
                props[key] = None if np.isnan(value) else round(float(value), 4)
    return feature_collection


def main() -> None:
    areas = load_areas()
    df = load_master(areas)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    columns = [
        "Provinsi", "pop", "Jumlah Desa", "area_km2", "Kepadatan Penduduk per km persegi (Km2)",
        "total_rs_est", "rsu", "rsk", "total_pkm", "pkm_ri", "pkm_nri",
        "rs_per100k", "pkm_per100k", "faskes_per100k",
        "rs_per_1000km2", "pkm_per_1000km2", "faskes_per_1000km2",
        "desa_pkm_pct", "desa_rs_pct", "pkm_needed", "pkm_gap", "kekurangan_pkm",
        "pkm_ratio_std", "status_std", "rank_pkm_per100k", "rank_rs_per100k",
        "rank_cakupan_pkm", "kuadran", "prioritas", "rsk_missing", "desa_balai_missing",
    ]
    provinces = json.loads(
        df[columns].rename(columns={"Provinsi": "provinsi"}).round(4).to_json(orient="records")
    )
    national_coverage, province_coverage = build_coverage(df)
    for province in provinces:
        province["coverage"] = province_coverage.get(province["provinsi"], {})

    payload = {
        "meta": {
            "judul": "Pemerataan Fasilitas Kesehatan Indonesia",
            "sumber": "BPS dan Kemenkes, diolah",
            "pipeline": "src/cleaning.py -> data/interim/faskes_interim_clean.csv",
            "tahun": "Penduduk 2026; desa/sarana/RS 2025",
            "level": "Provinsi",
            "catatan": "Data faskes menunjukkan keberadaan sarana, bukan akses efektif.",
        },
        "national": {**build_national(df), "coverage": national_coverage},
        "provinces": provinces,
    }
    feature_collection = build_geojson(df)

    with OUT_GEOJSON.open("w", encoding="utf-8") as f:
        json.dump(feature_collection, f, ensure_ascii=False, separators=(",", ":"))

    js = "window.DASHBOARD_DATA = " + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n"
    js += "window.DASHBOARD_GEOJSON = " + json.dumps(feature_collection, ensure_ascii=False, separators=(",", ":")) + ";\n"
    OUT_JS.write_text(js, encoding="utf-8")

    print("Data dashboard:", OUT_JS)
    print("GeoJSON dashboard:", OUT_GEOJSON)
    print("Provinsi:", len(provinces), "| Fitur peta:", len(feature_collection["features"]))


if __name__ == "__main__":
    main()
