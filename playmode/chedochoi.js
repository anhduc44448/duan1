// Sync: Functions gửi message về main script.js
let selectedAIMode = null;
let selectedAILevel = null;

function selectMode(mode) {
  console.log("Selecting mode in playmode:", mode);

  // Local feedback (active class)
  document
    .querySelectorAll(".mode-card")
    .forEach((card) => card.classList.remove("active"));
  const selectedCard = document.querySelector(`[data-mode="${mode}"]`);
  if (selectedCard) selectedCard.classList.add("active");

  if (mode === "ai") {
    // HIỂN THỊ phần chọn cấp độ AI với hiệu ứng
    const aiSection = document.getElementById("ai-level-section");
    aiSection.style.display = "block";
    aiSection.style.animation = "slideDown 0.6s ease-out";

    selectedAIMode = "ai";

    // Cuộn xuống phần chọn cấp độ
    setTimeout(() => {
      aiSection.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 300);
  } else {
    // ẨN phần chọn cấp độ AI nếu chọn multiplayer
    document.getElementById("ai-level-section").style.display = "none";
    selectedAILevel = null;

    // Sync: Gửi message về parent
    window.parent.postMessage(
      {
        type: "MODE_SELECTED",
        mode: mode,
        aiLevel: null,
      },
      "*"
    );
  }

  console.log("Sent MODE_SELECTED to main");
}

function selectAILevel(level) {
  console.log("Selecting AI level:", level);

  // Local feedback (active class với hiệu ứng)
  document.querySelectorAll(".ai-level-card").forEach((card) => {
    card.classList.remove("active");
    card.style.transform = "scale(1)";
  });

  const selectedCard = document.querySelector(`[data-level="${level}"]`);
  if (selectedCard) {
    selectedCard.classList.add("active");
    selectedCard.style.transform = "scale(1.05)";
  }

  selectedAILevel = level;

  // Hiệu ứng xác nhận
  if (selectedCard) {
    selectedCard.style.animation = "pulse 0.6s ease-in-out";
    setTimeout(() => {
      selectedCard.style.animation = "";
    }, 600);
  }

  // Tự động gửi sau khi chọn level (hoặc có thể thêm nút "Bắt đầu")
  setTimeout(() => {
    window.parent.postMessage(
      {
        type: "MODE_SELECTED",
        mode: "ai",
        aiLevel: level,
      },
      "*"
    );
  }, 800); // Delay để người dùng thấy hiệu ứng

  console.log("Sent AI_LEVEL_SELECTED to main - Level:", level);
}

function goBackToHome() {
  // Hiệu ứng trước khi quay lại
  document.querySelector(".mode-wrapper").style.animation =
    "fadeOut 0.5s ease-out";

  setTimeout(() => {
    window.parent.postMessage(
      {
        type: "GO_BACK",
      },
      "*"
    );
  }, 300);

  console.log("Sent GO_BACK to main");
}

// THÊM: Hiệu ứng pulse cho CSS
const style = document.createElement("style");
style.textContent = `
  @keyframes pulse {
    0% { transform: scale(1); }
    50% { transform: scale(1.08); }
    100% { transform: scale(1.05); }
  }
  @keyframes fadeOut {
    from { opacity: 1; transform: translateY(0); }
    to { opacity: 0; transform: translateY(-20px); }
  }
`;
document.head.appendChild(style);

// Sync: Init khi load iframe
document.addEventListener("DOMContentLoaded", () => {
  console.log("playmode/chedochoi loaded - ready for sync");
  // Hiệu ứng khi load
  document.querySelector(".mode-wrapper").style.animation =
    "fadeIn 0.8s ease-out";
});
