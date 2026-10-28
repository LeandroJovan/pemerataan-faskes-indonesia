from pathlib import Path
import logging
from datetime import datetime
import warnings

import matplotlib.pyplot as plt
import pandas as pd
import seaborn as sns

warnings.filterwarnings("ignore", category=FutureWarning)

BASE_DIR = Path(__file__).resolve().parent
RAW_DIR = BASE_DIR / "data" / "raw"
FIGURE_DIR = BASE_DIR / "outputs" / "figures"
TABLE_DIR = BASE_DIR / "outputs" / "tables"
FIGURE_DIR.mkdir(parents=True, exist_ok=True)
TABLE_DIR.mkdir(parents=True, exist_ok=True)

DATA_FILES = {
    "desa": RAW_DIR / "desa_kelurahan_provinsi_2025.csv",
    "sarana_desa": RAW_DIR / "desa_kelurahan_sarana_kesehatan_2025.csv",
    "penduduk": RAW_DIR / "penduduk_provinsi_2026.csv",
    "faskes": RAW_DIR / "rs_puskesmas_provinsi_2025.csv",
}

DATASET_LABELS = {
    "desa": "Jumlah Desa/Kelurahan Provinsi",
    "sarana_desa": "Sarana Kesehatan Desa/Kelurahan",
    "penduduk": "Kependudukan Provinsi",
    "faskes": "RS dan Puskesmas Provinsi",
}

# Indikator kunci yang dinilai secara eksploratif pada masing-masing dataset.
KEY_INDICATORS = {
    "desa": ["Jumlah Desa"],
    "sarana_desa": [
        "Desa/Kelurahan Yang Memiliki Sarana Kesehatan - Rumah Sakit",
        "Desa/Kelurahan Yang Memiliki Sarana Kesehatan - Puskesmas",
        "Desa/Kelurahan Yang Memiliki Sarana Kesehatan - Puskesmas Pembantu",
        "Desa/Kelurahan Yang Memiliki Sarana Kesehatan - Apotek",
        "Desa/Kelurahan Yang Memiliki Sarana Kesehatan - Klinik Utama (Unit)",
        "Desa/Kelurahan Yang Memiliki Sarana Kesehatan - Balai Kesehatan",
        "Desa/Kelurahan Yang Memiliki Sarana Kesehatan - Klinik Pratama",
    ],
    "penduduk": [
        "Jumlah Penduduk (Ribu)",
        "Laju Pertumbuhan Penduduk per Tahun",
        "Persentase Penduduk",
        "Kepadatan Penduduk per km persegi (Km2)",
        "Rasio Jenis Kelamin Penduduk",
    ],
    "faskes": [
        "Jumlah Rumah Sakit Umum",
        "Jumlah Rumah Sakit Khusus",
        "Jumlah Puskesmas Rawat Inap",
        "Jumlah Puskesmas Non Rawat Inap",
    ],
}

LOG_PATH = BASE_DIR / "EDA.log"
logger = logging.getLogger("EDA")
logger.setLevel(logging.INFO)
logger.handlers.clear()
handler = logging.FileHandler(LOG_PATH, mode="w", encoding="utf-8")
handler.setFormatter(logging.Formatter("%(asctime)s | %(levelname)s | %(message)s"))
logger.addHandler(handler)
logger.propagate = False


def log_indicator_catalog() -> None:
    logger.info("Mulai EDA pada %s", datetime.now().strftime("%d-%m-%Y %H:%M:%S"))
    logger.info("Indikator kunci per dataset:")
    for dataset, label in DATASET_LABELS.items():
        logger.info("- %s (%s): %s", dataset, label, "; ".join(KEY_INDICATORS[dataset]))


def read_provincial(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path, encoding="utf-8-sig")
    df["Provinsi"] = df["Provinsi"].astype("string").str.strip()

    # Remove national and source-note/footer rows which are not provinces.
    province_mask = df["Provinsi"].notna() & ~df["Provinsi"].isin(["Indonesia"])
    province_mask &= df["Provinsi"].str.len().fillna(0).gt(0)
    province_mask &= ~df["Provinsi"].str.startswith(("Keterangan", "Data ", "1", "2", "3", "4"))
    df = df.loc[province_mask].copy()

    numeric_columns = [column for column in df.columns if column != "Provinsi"]
    df[numeric_columns] = df[numeric_columns].apply(
        lambda series: pd.to_numeric(
            series.astype("string")
            .str.replace(",", ".", regex=False)
            .replace({"–": None, "-": None}),
            errors="coerce",
        )
    )
    return df


def load_data() -> dict[str, pd.DataFrame]:
    return {name: read_provincial(path) for name, path in DATA_FILES.items()}


def merge_provincial(data: dict[str, pd.DataFrame]) -> pd.DataFrame:
    province_names = set.intersection(*[set(df["Provinsi"]) for df in data.values()])
    province_names.discard("Indonesia")

    merged = pd.DataFrame({"Provinsi": sorted(province_names)})
    for df in data.values():
        merged = merged.merge(df, on="Provinsi", how="left", validate="one_to_one")
    return merged


def add_indicators(df: pd.DataFrame) -> pd.DataFrame:
    result = df.copy()

    faskes_columns = [
        "Jumlah Rumah Sakit Umum",
        "Jumlah Rumah Sakit Khusus",
        "Jumlah Puskesmas Rawat Inap",
        "Jumlah Puskesmas Non Rawat Inap",
    ]
    population_column = "Jumlah Penduduk (Ribu)"

    result["Jumlah Faskes"] = result[faskes_columns].sum(axis=1, min_count=1)
    result["Jumlah Rumah Sakit"] = (
        result["Jumlah Rumah Sakit Umum"] + result["Jumlah Rumah Sakit Khusus"]
    )
    result["Faskes per 100 Ribu Penduduk"] = (
        result["Jumlah Faskes"] / result[population_column].replace(0, pd.NA) * 100
    )
    result["Rumah Sakit per 100 Ribu Penduduk"] = (
        result["Jumlah Rumah Sakit"] / result[population_column].replace(0, pd.NA) * 100
    )
    result["Puskesmas per 100 Ribu Penduduk"] = (
        (result["Jumlah Puskesmas Rawat Inap"] + result["Jumlah Puskesmas Non Rawat Inap"])
        / result[population_column].replace(0, pd.NA)
        * 100
    )
    result["Faskes per Desa/Kelurahan"] = (
        result["Jumlah Faskes"] / result["Jumlah Desa"].replace(0, pd.NA)
    )
    return result


def plot_rankings(df: pd.DataFrame) -> Path:
    indicators = {
        "Faskes per 100 Ribu Penduduk": "Faskes per 100 ribu penduduk",
        "Rumah Sakit per 100 Ribu Penduduk": "Rumah sakit per 100 ribu penduduk",
        "Puskesmas per 100 Ribu Penduduk": "Puskesmas per 100 ribu penduduk",
        "Faskes per Desa/Kelurahan": "Faskes per desa/kelurahan",
    }

    sns.set_theme(style="whitegrid")
    fig, axes = plt.subplots(2, 2, figsize=(16, 12))
    for ax, (column, title) in zip(axes.ravel(), indicators.items(), strict=True):
        ranked = df[["Provinsi", column]].dropna().sort_values(column, ascending=False).head(10)
        sns.barplot(data=ranked, y="Provinsi", x=column, ax=ax, color="#2678b3")
        ax.set_title(title, fontsize=13, weight="bold")
        ax.set_xlabel("Nilai")
        ax.set_ylabel("")
        ax.tick_params(axis="y", labelsize=9)
        for container in ax.containers:
            ax.bar_label(container, fmt="%.2f", padding=3, fontsize=8)

    fig.suptitle("10 Besar Peringkat Provinsi Berdasarkan Indikator Kunci", fontsize=17, weight="bold")
    fig.tight_layout(rect=[0, 0, 1, 0.97])
    output = FIGURE_DIR / "peringkat_provinsi_indikator_kunci.png"
    fig.savefig(output, dpi=200, bbox_inches="tight")
    plt.close(fig)
    return output


def plot_correlation(df: pd.DataFrame) -> tuple[Path, pd.DataFrame]:
    # Numeric features from the four provincial aggregate datasets.
    feature_columns = [
        "Jumlah Penduduk (Ribu)",
        "Laju Pertumbuhan Penduduk per Tahun",
        "Kepadatan Penduduk per km persegi (Km2)",
        "Jumlah Desa",
        "Jumlah Rumah Sakit Umum",
        "Jumlah Rumah Sakit Khusus",
        "Jumlah Puskesmas Rawat Inap",
        "Jumlah Puskesmas Non Rawat Inap",
    ]
    sarana_columns = [column for column in df.columns if column.startswith("Desa/Kelurahan Yang Memiliki Sarana Kesehatan")]
    feature_columns.extend(sarana_columns[:3])

    corr = df[feature_columns].corr(numeric_only=True)
    short_names = {
        "Jumlah Penduduk (Ribu)": "Penduduk (ribu)",
        "Laju Pertumbuhan Penduduk per Tahun": "Pertumbuhan penduduk",
        "Kepadatan Penduduk per km persegi (Km2)": "Kepadatan penduduk",
        "Jumlah Desa": "Jumlah desa",
        "Jumlah Rumah Sakit Umum": "RS umum",
        "Jumlah Rumah Sakit Khusus": "RS khusus",
        "Jumlah Puskesmas Rawat Inap": "Puskesmas RI",
        "Jumlah Puskesmas Non Rawat Inap": "Puskesmas non-RI",
        sarana_columns[0]: "Desa ada RS",
        sarana_columns[1]: "Desa ada Puskesmas",
        sarana_columns[2]: "Desa ada Pustu",
    }
    corr.index = [short_names.get(column, column) for column in corr.index]
    corr.columns = [short_names.get(column, column) for column in corr.columns]

    import numpy as np

    mask = np.triu(np.ones_like(corr, dtype=bool), k=1)
    fig, ax = plt.subplots(figsize=(14, 11))
    sns.heatmap(corr, mask=mask, annot=True, fmt=".2f", cmap="RdBu_r", center=0, square=True,
                linewidths=0.5, cbar_kws={"label": "Koefisien korelasi"}, ax=ax,
                annot_kws={"size": 8})
    ax.set_title("Korelasi Antarfitur dari Empat Data Agregat Provinsi", fontsize=15, weight="bold")
    ax.tick_params(axis="x", labelrotation=45)
    plt.setp(ax.get_xticklabels(), ha="right")
    fig.tight_layout()
    output = FIGURE_DIR / "korelasi_antarfitur_4_data_agregat.png"
    fig.savefig(output, dpi=200, bbox_inches="tight")
    plt.close(fig)
    return output, corr


def detect_outliers(df: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    selected = {
        column: short_column_name(column)
        for column in df.select_dtypes(include="number").columns
    }
    records = []
    outlier_provinces = set()

    for column, label in selected.items():
        series = df[column].dropna()
        q1 = series.quantile(0.25)
        q3 = series.quantile(0.75)
        iqr = q3 - q1
        lower = q1 - 1.5 * iqr
        upper = q3 + 1.5 * iqr
        mask = df[column].lt(lower) | df[column].gt(upper)
        provinces = df.loc[mask, "Provinsi"].tolist()
        outlier_provinces.update(provinces)
        records.append({
            "Fitur": label,
            "Q1": q1,
            "Q3": q3,
            "IQR": iqr,
            "Batas bawah": lower,
            "Batas atas": upper,
            "Jumlah outlier": int(mask.sum()),
            "Provinsi outlier": "; ".join(provinces),
        })
    return pd.DataFrame(records), sorted(outlier_provinces)


def short_column_name(column: str) -> str:
    return (column.replace("Desa/Kelurahan Yang Memiliki Sarana Kesehatan - ", "")
                  .replace("Jumlah ", "")
                  .replace(" per km persegi (Km2)", " / km²")
                  .replace(" (Ribu)", " (ribu)"))


def plot_dataset_distributions(data: dict[str, pd.DataFrame]) -> list[Path]:
    outputs = []
    for dataset, df in data.items():
        numeric_columns = [column for column in KEY_INDICATORS[dataset] if pd.api.types.is_numeric_dtype(df[column])]
        columns_per_row = 2
        rows = (len(numeric_columns) + columns_per_row - 1) // columns_per_row
        fig, axes = plt.subplots(rows, columns_per_row, figsize=(16, 4.5 * rows), squeeze=False)
        for index, column in enumerate(numeric_columns):
            ax = axes.flat[index]
            sns.histplot(df[column].dropna(), kde=True, ax=ax, color="#4c78a8")
            ax.set_title(short_column_name(column), fontsize=11, weight="bold")
            ax.set_xlabel("Nilai")
            ax.set_ylabel("Frekuensi")
        for index in range(len(numeric_columns), len(axes.flat)):
            axes.flat[index].set_visible(False)
        fig.suptitle(f"Distribusi Data — {DATASET_LABELS[dataset]}", fontsize=17, weight="bold")
        fig.tight_layout(rect=[0, 0, 1, 0.96])
        output = FIGURE_DIR / f"distribusi_{dataset}.png"
        fig.savefig(output, dpi=200, bbox_inches="tight")
        plt.close(fig)
        outputs.append(output)
    return outputs


def plot_dataset_outliers(data: dict[str, pd.DataFrame]) -> list[Path]:
    outputs = []
    for dataset, df in data.items():
        numeric_columns = [column for column in KEY_INDICATORS[dataset] if pd.api.types.is_numeric_dtype(df[column])]
        standardized = df[numeric_columns].apply(
            lambda series: (series - series.mean()) / series.std(ddof=0)
            if series.std(ddof=0) not in (0, None) else series * 0
        )
        plot_data = standardized.rename(columns=short_column_name).melt(var_name="Kolom", value_name="Nilai distandardisasi")

        fig, ax = plt.subplots(figsize=(max(14, 1.05 * len(numeric_columns)), 7))
        sns.boxplot(data=plot_data, x="Kolom", y="Nilai distandardisasi", ax=ax,
                    color="#9ed9c6", linewidth=1, width=0.65,
                    flierprops={"marker": "o", "markersize": 2.5, "markerfacecolor": "#94d2bd",
                                "markeredgecolor": "#3d405b", "alpha": 0.75})
        ax.axhline(-1.5, color="#c44e52", linestyle="--", linewidth=0.8, alpha=0.7)
        ax.axhline(1.5, color="#c44e52", linestyle="--", linewidth=0.8, alpha=0.7)
        ax.set_title(f"Boxplot Semua Fitur (Distandardisasi) — {DATASET_LABELS[dataset]} — Titik di luar kotak = outlier",
                     fontsize=13, weight="bold")
        ax.set_xlabel("")
        ax.set_ylabel("Z-score")
        ax.tick_params(axis="x", labelrotation=90, labelsize=8)
        ax.grid(axis="y", alpha=0.25)
        fig.tight_layout()
        output = FIGURE_DIR / f"outlier_{dataset}.png"
        fig.savefig(output, dpi=200, bbox_inches="tight")
        plt.close(fig)
        outputs.append(output)
    return outputs


def main() -> None:
    log_indicator_catalog()
    data = load_data()
    logger.info("Dataset dimuat: %s", ", ".join(f"{name}={len(df)} baris" for name, df in data.items()))
    merged = merge_provincial(data)
    indicators = add_indicators(merged)
    logger.info("Provinsi yang memiliki data lengkap pada keempat dataset: %d", len(indicators))

    indicators.to_csv(TABLE_DIR / "provinsi_indikator_kunci.csv", index=False)
    ranking_output = plot_rankings(indicators)
    correlation_output, correlation = plot_correlation(indicators)
    correlation.to_csv(TABLE_DIR / "korelasi_antarfitur_4_data_agregat.csv")
    outlier_table, outlier_provinces = detect_outliers(indicators)
    outlier_table.to_csv(TABLE_DIR / "deteksi_outlier.csv", index=False)
    distribution_outputs = plot_dataset_distributions(data)
    outlier_outputs = plot_dataset_outliers(data)

    logger.info("Peringkat top 10 disimpan: %s", ranking_output.name)
    logger.info("Heatmap korelasi segitiga disimpan: %s", correlation_output.name)
    logger.info("Provinsi yang terdeteksi outlier pada indikator gabungan: %s", "; ".join(outlier_provinces))
    logger.info("Distribusi per dataset: %s", ", ".join(path.name for path in distribution_outputs))
    logger.info("Outlier vertikal per dataset: %s", ", ".join(path.name for path in outlier_outputs))
    logger.info("Ringkasan outlier disimpan: deteksi_outlier.csv")
    logger.info("EDA selesai")

    print(f"Provinsi dianalisis: {len(indicators)}")
    print(f"Peringkat indikator: {ranking_output}")
    print(f"Korelasi fitur:     {correlation_output}")
    print("Distribusi per dataset:")
    for output in distribution_outputs:
        print(f"  {output}")
    print("Outlier vertikal per dataset:")
    for output in outlier_outputs:
        print(f"  {output}")
    print(f"Ringkasan outlier:  {TABLE_DIR / 'deteksi_outlier.csv'}")
    print(f"Catatan EDA:        {LOG_PATH}")


if __name__ == "__main__":
    main()
