
const dataProvinsi = {
  "Aceh": {
    rsu: 77,
    rsk: 9,
    rawat: 174,
    nonrawat: 192,
    asuransi: [85.29, 12.5, 1.28, 0.13, 0.7],
    penyakit: [68, 81, 338, 4.32, 0.06, 37.08]
  },

  "Sumatera Utara": {
    rsu: 185,
    rsk: 23,
    rawat: 178,
    nonrawat: 441,
    asuransi: [41.36, 26.55, 1.52, null, 2.63],
    penyakit: [74, 79, 3041, null, 0.37, 27.91]
  }
};

// Format angka dengan format Indonesia
function formatAngka(nilai) {
  if (nilai === null || nilai === undefined) {
    return "—";
  }

  return new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 2
  }).format(nilai);
}

// Grafik jaminan kesehatan
const chart = new Chart(
  document.getElementById("insuranceChart"),
  {
    type: "bar",

    data: {
      labels: [
        "BPJS PBI",
        "BPJS Non-PBI",
        "Jamkesda",
        "Asuransi Swasta",
        ["Perusahaan", "/Kantor"]
      ],

      datasets: [{
        label: "Persentase (%)",
        data: [null, null, null, null, null],

        backgroundColor: [
          "#2e8c7e",
          "#55ad9f",
          "#79c5b4",
          "#9bd8c9",
          "#c6e9e2"
        ],

        borderRadius: 4,
        maxBarThickness: 48
      }]
    },

    options: {
      responsive: true,
      maintainAspectRatio: false,

      plugins: {
        legend: {
          display: false
        },

        tooltip: {
          callbacks: {
            label: function(context) {
              return context.raw == null
                ? "Data belum tersedia"
                : context.raw + "%";
            }
          }
        }
      },

      scales: {
        y: {
          beginAtZero: true,
          max: 100,

          ticks: {
            callback: value => value + "%",
            font: { size: 9 }
          },

          grid: {
            color: "#edf3f5"
          }
        },

        x: {
          ticks: {
            font: { size: 9 }
          },

          grid: {
            display: false
          }
        }
      }
    }
  }
);

// Memperbarui tampilan saat provinsi dipilih
function renderDashboard(provinsi) {
  const data = dataProvinsi[provinsi];

  const fasilitas = [
    ["rsu", data?.rsu],
    ["rsk", data?.rsk],
    ["rawat", data?.rawat],
    ["nonrawat", data?.nonrawat]
  ];

  fasilitas.forEach(([id, nilai]) => {
    document.getElementById(id).textContent =
      formatAngka(nilai);
  });

  const indikatorPenyakit = [
    "tb",
    "tbs",
    "hiv",
    "kusta",
    "malaria",
    "dbd"
  ];

  indikatorPenyakit.forEach((id, index) => {
    document.getElementById(id).textContent =
      formatAngka(data?.penyakit[index]);
  });

  chart.data.datasets[0].data = data
    ? data.asuransi
    : [null, null, null, null, null];

  chart.update();
}

document
  .getElementById("provinceFilter")
  .addEventListener("change", function(event) {
    renderDashboard(event.target.value);
  });

// Tampilan awal: belum menampilkan total nasional
renderDashboard("all");


const navLinks = document.querySelectorAll(
  "#sidebarNav .nav-link"
);

navLinks.forEach((link) => {
  link.addEventListener("click", function (event) {
    event.preventDefault();

    const targetId = this.dataset.target;
    const targetElement = document.getElementById(targetId);

    if (!targetElement) return;

    // Menghapus status aktif dari semua menu
    navLinks.forEach((item) => {
      item.classList.remove("active");
    });

    // Mengaktifkan menu yang dipilih
    this.classList.add("active");

    // Mengarahkan halaman ke bagian terkait
    if (targetId === "beranda") {
      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });
    } else {
      targetElement.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }
  });
});
