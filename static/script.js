// Khai báo biến toàn cục
const socket = io();
const boardDiv = document.getElementById("chessboard");
let currentBoard = [];
let selectedSquare = null;
let currentRoom = null;
let currentMode = null;

// Hàm hiển thị section
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

// Hàm chọn chế độ chơi
function selectMode(mode) {
  console.log("Selecting mode:", mode);
  currentMode = mode;
  if (mode === "ai") {
    currentRoom = "ai_" + Math.random().toString(36).substring(2, 10);
    socket.emit("join", { room: currentRoom, mode: "ai" });
    document.getElementById("status").innerText =
      "Đã tham gia phòng AI: " + currentRoom;
    showGameSection();
  } else {
    showSection("multi-room-section");
  }
}

// Hàm tham gia phòng
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

// Hàm hiển thị section game
function showGameSection() {
  showSection("game-section");
}

// Hàm vẽ bàn cờ với ánh xạ tên file mới
function drawBoard(board) {
  if (!boardDiv || !Array.isArray(board) || board.length !== 8) return;
  boardDiv.innerHTML = "";
  const pieceMap = {
    wp: "TotTrang", // Tốt trắng (Pawn)
    bp: "TotDen", // Tốt đen (Pawn)
    wR: "XeTrang", // Xe trắng (Rook) - Giả định
    bR: "XeDen", // Xe đen (Rook) - Giả định
    wN: "MaTrang", // Mã trắng (Knight)
    bN: "MaDen", // Mã đen (Knight)
    wB: "TuongTrang", // Tướng trắng (Bishop)
    bB: "TuongDen", // Tướng đen (Bishop)
    wQ: "HauTrang", // Hậu trắng (Queen)
    bQ: "HauDen", // Hậu đen (Queen)
    wK: "VuaTrang", // Vua trắng (King)
    bK: "VuaDen", // Vua đen (King)
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
        const imgSrc = `/static/images/${pieceMap[piece] || piece}.png`;
        img.src = imgSrc;
        img.alt = piece;
        img.onload = () => console.log("Tải ảnh thành công:", imgSrc);
        img.onerror = () => {
          console.error("Lỗi tải ảnh:", imgSrc, "Fallback to default.png");
          img.src = "/static/images/default.png";
        };
        square.appendChild(img);
      }

      if (
        selectedSquare &&
        selectedSquare.row === row &&
        selectedSquare.col === col
      ) {
        square.style.outline = "3px solid blue";
      }

      square.addEventListener("click", () => handleClick(row, col));
      boardDiv.appendChild(square);
    }
  }
}

// Hàm xử lý click trên bàn cờ
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

// Hàm reset bàn cờ
function resetBoard() {
  if (currentRoom) {
    socket.emit("reset", { room: currentRoom });
  }
}

// Khởi tạo kết nối socket
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
});

socket.on("game_over", (data) => {
  alert(data.msg);
});

// Khởi tạo trang chủ khi tải trang
window.onload = function () {
  showSection("home-section");
};
