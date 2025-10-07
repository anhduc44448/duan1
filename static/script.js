// Sync: Socket init ở main, toàn cục cho toàn app
const socket = io();
const boardDiv = document.getElementById("chessboard");
let currentBoard = [];
let selectedSquare = null;
let currentRoom = null;
let currentMode = null;

// Sync: Show section (dùng cho SPA navigation)
function showSection(sectionId) {
  console.log("Attempting to show section:", sectionId);
  const sections = document.querySelectorAll(".section");
  if (!sections) {
    console.error("No sections found!");
    return;
  }
  sections.forEach((section) => {
    section.style.display = "none";
  });
  const targetSection = document.getElementById(sectionId);
  if (targetSection) {
    targetSection.style.display = "block";
    console.log("Section displayed:", sectionId);
  } else {
    console.error("Section not found:", sectionId);
  }
}

// Sync: Load mode iframe từ playmode/
function loadModeSection() {
  const iframe = document.getElementById("mode-iframe");
  iframe.style.display = "block";
  showSection("mode-section");
  console.log("Loaded mode iframe from playmode/");
}

// Sync: Join room (cho multi)
function joinRoom() {
  const room = document.getElementById("roomInput").value;
  if (room) {
    currentRoom = room;
    socket.emit("join", { room: currentRoom, mode: "multi" });
    document.getElementById("status").innerText =
      "Đã tham gia phòng: " + currentRoom + " (Vs Người)";
    showGameSection();
  } else {
    alert("Vui lòng nhập Room ID!");
  }
}

// Sync: Show game section
function showGameSection() {
  showSection("game-section");
}

// Sync: Select mode (gọi từ message của playmode/chedochoi.js)
function selectMode(mode) {
  console.log("Selecting mode from playmode:", mode);
  currentMode = mode;

  if (mode === "ai") {
    currentRoom = "ai_" + Math.random().toString(36).substring(2, 10);
    socket.emit("join", { room: currentRoom, mode: "ai" });
    const statusEl = document.getElementById("status");
    if (statusEl) statusEl.innerText = "Đã tham gia phòng AI: " + currentRoom;
    // Sync: Ẩn iframe sau sync
    document.getElementById("mode-iframe").style.display = "none";
    showGameSection();
  } else {
    // Multi
    document.getElementById("mode-iframe").style.display = "none";
    showSection("multi-room-section");
  }
}

// Sync: Draw board (gốc)
function drawBoard(board) {
  if (!boardDiv || !Array.isArray(board) || board.length !== 8) return;
  boardDiv.innerHTML = "";
  const pieceMap = {
    wp: "tottrang",
    bp: "totden",
    wR: "xetrang",
    bR: "xeden",
    wN: "matrang",
    bN: "maden",
    wB: "tuongtrang",
    bB: "tuongden",
    wQ: "hautrang",
    bQ: "hauden",
    wK: "vuatrang",
    bK: "vuaden",
  };
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const square = document.createElement("div");
      square.classList.add("square");
      square.classList.add((row + col) % 2 === 0 ? "light" : "dark");
      square.dataset.row = row;
      square.dataset.col = col;

      const piece = board[row][col];
      if (piece !== "--") {
        const img = document.createElement("img");
        const imgSrc = `./static/images/${pieceMap[piece] || piece}.png`; // Path sync: static/images/
        img.src = imgSrc;
        img.alt = piece;
        img.onload = () => console.log("Tải ảnh thành công:", imgSrc);
        img.onerror = () => {
          console.error("Lỗi tải ảnh:", imgSrc, "Fallback to default.png");
          img.src = "./static/images/default.png";
        };
        square.appendChild(img);
      }

      if (
        selectedSquare &&
        selectedSquare.row === row &&
        selectedSquare.col === col
      ) {
        square.classList.add("selected");
      }

      square.addEventListener("click", () => handleClick(row, col));
      boardDiv.appendChild(square);
    }
  }
}

// Sync: Handle click board
function handleClick(row, col) {
  if (!currentRoom) {
    alert("Bạn cần join room trước!");
    return;
  }
  if (selectedSquare) {
    if (selectedSquare.row === row && selectedSquare.col === col) {
      selectedSquare = null;
      drawBoard(currentBoard);
      return;
    }
    const from = selectedSquare;
    const to = { row, col };
    socket.emit("make_move", { room: currentRoom, from, to });
    selectedSquare = null;
  } else {
    selectedSquare = { row, col };
    drawBoard(currentBoard);
  }
}

// Sync: Reset board
function resetBoard() {
  if (currentRoom) {
    socket.emit("reset", { room: currentRoom });
  }
}

// Sync: Socket events
socket.on("connect_error", (error) => {
  console.error("Connection error:", error);
  alert("Không thể kết nối đến server. Vui lòng thử lại!");
});

socket.on("connect", () => {
  console.log("✅ Connected to server");
});

socket.on("board_update", (data) => {
  currentBoard = data.board;
  drawBoard(currentBoard);
  document.getElementById("turn").innerText = data.whiteToMove
    ? "Lượt Trắng"
    : "Lượt Đen";
});

socket.on("invalid_move", (data) => {
  alert(data.msg);
  drawBoard(currentBoard);
});

socket.on("game_over", (data) => {
  alert(data.msg);
});

// Sync: Listener message từ iframe playmode/
window.addEventListener("message", (event) => {
  if (event.data && event.data.type === "MODE_SELECTED") {
    selectMode(event.data.mode);
  } else if (event.data && event.data.type === "GO_BACK") {
    showSection("home-section");
    document.getElementById("mode-iframe").style.display = "none";
  }
  console.log("Received message from playmode iframe:", event.data);
});

// Sync: Init app
window.onload = function () {
  showSection("home-section");
};
