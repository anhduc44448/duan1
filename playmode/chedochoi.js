// Biến toàn cục
let selectedMode = null;
let selectedAILevel = 2; // Mặc định Trung bình
let selectedColor = "white"; // THÊM: Mặc định là trắng
let roomId = "";

function selectMode(mode) {
  console.log("Selecting mode:", mode);

  // Cập nhật giao diện
  document.querySelectorAll(".mode-card").forEach((card) => {
    card.classList.remove("active");
  });
  document.querySelector(`[data-mode="${mode}"]`).classList.add("active");

  selectedMode = mode;

  // Hiển thị phần cấu hình
  const configSection = document.getElementById("game-config-section");
  configSection.style.display = "block";
  configSection.style.animation = "slideDown 0.6s ease-out";

  // Hiển thị/ẩn phần cấp độ AI
  const aiLevelSection = document.querySelector(".ai-only");
  aiLevelSection.style.display = mode === "ai" ? "block" : "none";

  // Cập nhật thông tin phòng
  updateRoomInfo();

  // Cuộn xuống phần cấu hình
  setTimeout(() => {
    configSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 300);
}

function selectAILevel(level) {
  console.log("Selecting AI level:", level);

  // Cập nhật giao diện
  document.querySelectorAll(".level-btn").forEach((btn) => {
    btn.classList.remove("active");
  });
  document.querySelector(`[data-level="${level}"]`).classList.add("active");

  selectedAILevel = level;
  updateRoomInfo();
}

// THÊM: Hàm chọn màu
function selectColor(color) {
  console.log("Selecting color:", color);

  // Cập nhật giao diện
  document.querySelectorAll(".color-btn").forEach((btn) => {
    btn.classList.remove("active");
  });
  document.querySelector(`[data-color="${color}"]`).classList.add("active");

  // Xử lý màu ngẫu nhiên
  if (color === "random") {
    color = Math.random() > 0.5 ? "white" : "black";
  }

  selectedColor = color;
  updateRoomInfo();
}

// SỬA: Hàm cập nhật thông tin phòng
function updateRoomInfo() {
  const roomInput = document.getElementById("roomInput");
  roomId = roomInput.value.trim();

  const roomInfo = document.getElementById("roomInfo");

  if (selectedMode === "ai") {
    const levelNames = { 1: "Dễ", 2: "Trung Bình", 3: "Khó" };
    const colorText = selectedColor === "white" ? "Trắng" : "Đen";
    // SỬA: Thêm thông tin màu và lượt đầu random
    roomInfo.innerHTML = `Chế độ: AI (${levelNames[selectedAILevel]}) | Người chơi: ${colorText} | Lượt đầu: Random`;
  } else {
    const roomDisplay = roomId ? roomId : "Tạo phòng mới";
    const colorText = selectedColor === "white" ? "Trắng" : "Đen";
    // SỬA: Thêm thông tin màu và lượt đầu random
    roomInfo.innerHTML = `Chế độ: Multiplayer | Phòng: ${roomDisplay} | Người chơi: ${colorText} | Lượt đầu: Random`;
  }
}

function generateRoomId() {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

// SỬA: Hàm bắt đầu game - thêm playerColor
function startGame() {
  const roomInput = document.getElementById("roomInput");
  let finalRoomId = roomInput.value.trim();

  // Tạo Room ID nếu để trống
  if (!finalRoomId) {
    finalRoomId = generateRoomId();
    roomInput.value = finalRoomId;
  }

  console.log("Starting game with config:", {
    mode: selectedMode,
    roomId: finalRoomId,
    aiLevel: selectedAILevel,
    playerColor: selectedColor, // THÊM: màu người chơi
  });

  if (!selectedMode) {
    alert("Vui lòng chọn chế độ chơi!");
    return;
  }

  // Gửi thông tin về main app - THÊM playerColor
  window.parent.postMessage(
    {
      type: "GAME_START",
      mode: selectedMode,
      roomId: finalRoomId,
      aiLevel: selectedMode === "ai" ? selectedAILevel : null,
      playerColor: selectedColor, // THÊM
    },
    "*"
  );

  console.log("Sent GAME_START to main app with color:", selectedColor);
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
}

// Lắng nghe sự kiện input Room ID
document.addEventListener("DOMContentLoaded", function () {
  const roomInput = document.getElementById("roomInput");

  roomInput.addEventListener("input", function () {
    updateRoomInfo();
  });

  roomInput.addEventListener("focus", function () {
    if (!this.value) {
      this.value = generateRoomId();
      updateRoomInfo();
    }
  });

  // Khởi tạo mặc định
  document.querySelector('[data-level="2"]').classList.add("active");
  document.querySelector('[data-color="white"]').classList.add("active"); // THÊM: khởi tạo màu mặc định

  // Hiệu ứng khi load
  document.querySelector(".mode-wrapper").style.animation =
    "fadeIn 0.8s ease-out";
});

// Thêm CSS animations
const style = document.createElement("style");
style.textContent = `
    @keyframes fadeOut {
        from { opacity: 1; transform: translateY(0); }
        to { opacity: 0; transform: translateY(-20px); }
    }
`;
document.head.appendChild(style);
