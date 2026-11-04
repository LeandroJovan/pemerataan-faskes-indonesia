"""
Generator Dashboard Data tanpa geopandas.
Membaca langsung dari master_provinsi_clean.csv (notebook 02) dan menulis dashboard-data.js.
Tidak ada backend; static HTML + CSV → JS data.

Jalankan:
    python -m src.build_from_csv
"""
from __future__ import annotations
import json
import math
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
PROCESSED_CSV = ROOT / "data" / "processed" / "master_provinsi_clean.csv"
GEOJSON_IN = ROOT / "dashboard" / "data" / "indonesia_provinsi.geojson"
OUT_JS = ROOT / "dashboard" / "data" / "dashboard-data.js"
OUT_GEOJSON = ROOT / "dashboard" / "data" / "indonesia_provinsi.geojson"

# Kolom yang dibutuhkan dari master CSV (harus ada setelah notebook 02 selesai)
REQUIRED_COLS = [
    "Provinsi", "total_rs_est","rsu","rsk","total_pkm","pkm_ri","pkm_nri",
    "pop","area_km2","Jumlah Desa", "desa_pkm","desa_rs","desa_balai",
    "pkm_needed","pkm_gap","pkm_ratio_std","rsk_missing","desa_balai_missing",
    "Kepadatan Penduduk per km persegi (Km2)",
]

def gini(x: pd.Series) -> float:
    vals = x.dropna().to_numpy(dtype=float)
    if len(vals) == 0 or vals.sum() == 0:
        return 0.0
    vals = np.sort(vals)
    n = len(vals)
    cumsum = np.cumsum(vals)
    total = cumsum[-1]
    return float((2 * np.sum(np.arange(1, n + 1) * vals)) / (n * total) - (n + 1) / n)


def theil(x: pd.Series) -> float:
    vals = x.dropna().to_numpy(dtype=float)
    mu = vals.mean()
    if mu == 0:
        return 0.0
    return float(np.mean((vals / mu) * np.log(vals / mu)))


def share_top5(x: pd.Series) -> float:
    vals = x.dropna()
    if vals.sum() == 0:
        return 0.0
    return float(vals.nlargest(5).sum() / vals.sum() * 100)


def main():
    if not PROCESSED_CSV.exists():
        raise FileNotFoundError(f"CSV master tidak ditemukan: {PROCESSED_CSV}")
    df = pd.read_csv(PROCESSED_CSV)
    
    # Basic validation
    missing_cols = [c for c in REQUIRED_COLS if c not in df.columns]
    if missing_cols:
        raise ValueError(f"Kolom hilang di CSV: {missing_cols}")
    
    # Normalisasi nama provinsi
    df["Provinsi"] = df["Provinsi"].str.strip()
    
    # Derive additional columns (jika belum ada)
    df["faskes_per100k"] = (df["total_rs_est"] + df["total_pkm"]) / df["pop"] * 100_000
    if "pkm_per_1000km2" not in df.columns:
        df["pkm_per_1000km2"] = df["total_pkm"] / df["area_km2"] * 1000
    if "rs_per_1000km2" not in df.columns:
        df["rs_per_1000km2"] = df["total_rs_est"] / df["area_km2"] * 1000
    if "faskes_per_1000km2" not in df.columns:
        df["faskes_per_1000km2"] = (df["total_pkm"] + df["total_rs_est"]) / df["area_km2"] * 1000
    
    # Coverage rates per province
    df["desa_pkm_pct"] = df["desa_pkm"] / df["Jumlah Desa"] * 100
    df["desa_rs_pct"] = df["desa_rs"] / df["Jumlah Desa"] * 100
    
    # Kuadran & Prioritas (same logic as original prepare_dashboard.py)
    med_pkm_pc = df["pkm_per100k"].median()
    med_cakupan = df["desa_pkm_pct"].median()
    
    def assign_kuadran(row):
        if row["pkm_per100k"] >= med_pkm_pc and row["desa_pkm_pct"] >= med_cakupan:
            return "tinggi-tinggi"
        if row["pkm_per100k"] >= med_pkm_pc and row["desa_pkm_pct"] < med_cakupan:
            return "tinggi per kapita / rendah cakupan"
        if row["pkm_per100k"] < med_pkm_pc and row["desa_pkm_pct"] >= med_cakupan:
            return "rendah per kapita / tinggi cakupan"
        return "rendah-rendah"
    
    df["kuadran"] = df.apply(assign_kuadran, axis=1)
    df["prioritas"] = df["kuadran"].map({
        "rendah-rendah": "Prioritas primary care",
        "tinggi per kapita / rendah cakupan": "Prioritas akses geografis",
        "rendah per kapita / tinggi cakupan": "Tantangan kepadatan",
        "tinggi-tinggi": "Relatif seimbang",
    })
    
    # Additional derived fields used by dashboard
    df["kekurangan_pkm"] = (df["pkm_needed"] - df["total_pkm"]).clip(lower=0).round(1)
    df["status_std"] = np.where(df["pkm_gap"] >= 0, "Memenuhi", "Belum memenuhi")
    df["rank_pkm_per100k"] = df["pkm_per100k"].rank(ascending=False, method="min").astype(int)
    df["rank_rs_per100k"] = df["rs_per100k"].rank(ascending=False, method="min").astype(int)
    df["rank_cakupan_pkm"] = df["desa_pkm_pct"].rank(ascending=False, method="min").astype(int)
    
    # Build COVERAGE_LABELS
    COVERAGE_LABELS = {
        "desa_rs": "Rumah Sakit",
        "desa_pkm": "Puskesmas",
        "desa_pustu": "Puskesmas Pembantu",
        "desa_apotek": "Apotek",
        "desa_klinik_utama": "Klinik Utama",
        "desa_balai": "Balai Kesehatan",
        "desa_klinik_pratama": "Klinik Pratama",
    }
    
    def national_coverage_vals(df: pd.DataFrame) -> dict:
        total_desa = int(df["Jumlah Desa"].sum())
        res = {}
        for col, label in COVERAGE_LABELS.items():
            if label is None or col not in df.columns:
                continue
            total = int(df[col].sum())
            res[label] = {"jumlah": total, "pct": round(total / total_desa * 100, 2)}
        return res
    
    def province_coverage_vals(row: pd.Series) -> dict:
        res = {}
        total_desa = int(row["Jumlah Desa"])
        for col, label in COVERAGE_LABELS.items():
            if label is None or col not in row.index:
                continue
            val = row[col]
            res[label] = None if pd.isna(val) else round(float(val / total_desa * 100), 2)
        return res
    
    # National stats
    national = {
        "provinsi": int(len(df)),
        "penduduk": float(df["pop"].sum()),
        "desa": int(df["Jumlah Desa"].sum()),
        "puskesmas": int(df["total_pkm"].sum()),
        "rs": round(float(df["total_rs_est"].sum()), 1),
        "rsu": int(df["rsu"].sum()),
        "rsk": int(df["rsk"].fillna(0).sum()),
        "desa_tanpa_pkm": int(df["Jumlah Desa"].sum()) - int(df["desa_pkm"].sum()),
        "desa_tanpa_rs": int(df["Jumlah Desa"].sum()) - int(df["desa_rs"].sum()),
        "pct_desa_tanpa_pkm": round((int(df["Jumlah Desa"].sum()) - int(df["desa_pkm"].sum())) / int(df["Jumlah Desa"].sum()) * 100, 2),
        "pct_desa_tanpa_rs": round((int(df["Jumlah Desa"].sum()) - int(df["desa_rs"].sum())) / int(df["Jumlah Desa"].sum()) * 100, 2),
        "provinsi_belum_std": int((df["pkm_gap"] < 0).sum()),
        "provinsi_memenuhi_std": int(len(df) - (df["pkm_gap"] < 0).sum()),
        "median_pkm_per100k": round(float(df["pkm_per100k"].median()), 4),
        "median_rs_per100k": round(float(df["rs_per100k"].median()), 4),
        "median_cakupan_pkm": round(float(df["desa_pkm_pct"].median()), 4),
        "gini_rs_abs": round(gini(df["total_rs_est"]), 3),
        "gini_pkm_abs": round(gini(df["total_pkm"]), 3),
        "gini_rs_pc": round(gini(df["rs_per100k"]), 3),
        "gini_pkm_pc": round(gini(df["pkm_per100k"]), 3),
        "theil_pkm_pc": round(theil(df["pkm_per100k"]), 3),
        "top5_share_pop": round(share_top5(df["pop"]), 2),
        "top5_share_rs": round(share_top5(df["total_rs_est"]), 2),
        "top5_share_pkm": round(share_top5(df["total_pkm"]), 2),
        "coverage": national_coverage_vals(df),
    }
    
    # Build provinces list
    columns_out = [
        "Provinsi","pop","Jumlah Desa","area_km2","Kepadatan Penduduk per km persegi (Km2)",
        "total_rs_est","rsu","rsk","total_pkm","pkm_ri","pkm_nri",
        "rs_per100k","pkm_per100k","faskes_per100k",
        "rs_per_1000km2","pkm_per_1000km2","faskes_per_1000km2",
        "desa_pkm_pct","desa_rs_pct","pkm_needed","pkm_gap","kekurangan_pkm",
        "pkm_ratio_std","status_std","rank_pkm_per100k","rank_rs_per100k",
        "rank_cakupan_pkm","kuadran","prioritas","rsk_missing","desa_balai_missing",
    ]
    
    # Alias agar cocok dengan key yang dibaca dashboard/script.js
    df["faskes_per1000km2"] = df["faskes_per_1000km2"]
    columns_out.append("faskes_per1000km2")
    
    provinces_raw = df.copy()
    provinces_json = provinces_raw.round(4)[columns_out].rename(columns={"Provinsi": "provinsi"}).to_dict(orient="records")
    for prov_row in provinces_json:
        prov_name = prov_row["provinsi"]
        row = df[df["Provinsi"] == prov_name].iloc[0]
        prov_row["coverage"] = province_coverage_vals(row)
    
    # Meta info
    payload = {
        "meta": {
            "judul": "Pemerataan Fasilitas Kesehatan Indonesia",
            "sumber": "BPS dan Kemenkes, diolah",
            "pipeline": "data/processed/master_provinsi_clean.csv -> src/build_from_csv.py",
            "tahun": "Penduduk 2026; desa/sarana/RS 2025",
            "level": "Provinsi",
            "catatan": "Data faskes menunjukkan keberadaan sarana, bukan akses efektif.",
        },
        "national": national,
        "provinces": provinces_json,
    }
    
    # GeoJSON: load existing, ensure consistency
    if not GEOJSON_IN.exists():
        raise FileNotFoundError(f"GeoJSON tidak ditemukan: {GEOJSON_IN}")
    
    with GEOJSON_IN.open("r", encoding="utf-8") as f:
        feature_collection = json.load(f)
    
    # Ensure properties match (optional update kuadran/prioritas if changed)
    prov_map = {r["provinsi"]: r for r in payload["provinces"]}
    for feat in feature_collection["features"]:
        name = feat["properties"]["name"]
        if name in prov_map:
            # Copy selected new fields
            d = prov_map[name]
            feat["properties"]["kuadran"] = d.get("kuadran")
            feat["properties"]["prioritas"] = d.get("prioritas")
            feat["properties"]["faskes_per100k"] = d.get("faskes_per100k")
            feat["properties"]["desa_pkm_pct"] = d.get("desa_pkm_pct")
            feat["properties"]["desa_rs_pct"] = d.get("desa_rs_pct")
            feat["properties"]["kekurangan_pkm"] = d.get("kekurangan_pkm")
            feat["properties"]["pkm_ratio_std"] = d.get("pkm_ratio_std")
            feat["properties"]["rs_per_1000km2"] = d.get("rs_per_1000km2")
            feat["properties"]["pkm_per_1000km2"] = d.get("pkm_per_1000km2")
            feat["properties"]["faskes_per_1000km2"] = d.get("faskes_per_1000km2")
            feat["properties"]["status_std"] = d.get("status_std")
            feat["properties"]["rank_pkm_per100k"] = d.get("rank_pkm_per100k")
            feat["properties"]["rank_rs_per100k"] = d.get("rank_rs_per100k")
            feat["properties"]["rank_cakupan_pkm"] = d.get("rank_cakupan_pkm")
    
    # Save files
    OUT_DIR = OUT_GEOJSON.parent
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    
    with OUT_GEOJSON.open("w", encoding="utf-8") as f:
        json.dump(feature_collection, f, ensure_ascii=False, separators=(",", ":"))
    
    js = "window.DASHBOARD_DATA = " + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n"
    js += "window.DASHBOARD_GEOJSON = " + json.dumps(feature_collection, ensure_ascii=False, separators=(",", ":")) + ";\n"
    OUT_JS.write_text(js, encoding="utf-8")
    
    print("[OK] Data dashboard:", OUT_JS)
    print("[OK] GeoJSON dashboard:", OUT_GEOJSON)
    print("[OK] Provinsi:", len(payload["provinces"]), "| Fitur peta:", len(feature_collection["features"]))
    
    # Print basic check
    bad_coverage = sum(1 for p in payload["provinces"] if p["coverage"] == {})
    if bad_coverage > 0:
        print(f"[WARN] {bad_coverage} provinsi dengan coverage kosong.")


if __name__ == "__main__":
    main()
