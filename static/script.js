// Sync: Socket init ở main, toàn cục cho toàn app
const socket = io();
const boardDiv = document.getElementById("chessboard");
let currentBoard = [];
let selectedSquare = null;
let currentRoom = null;
let currentMode = null;
let currentAILevel = 2;
let playerColor = "white"; // Biến lưu màu người chơi
let currentWhiteToMove = true; // Biến lưu trạng thái lượt đi hiện tại
let canUndo = false; // THÊM: Biến theo dõi trạng thái nút undo
let canRedo = false; // THÊM: Biến theo dõi trạng thái nút redo

// HÀM MỚI: Xử lý bắt đầu game từ cấu hình
function startGameFromConfig(config) {
  console.log("Starting game with config:", config);

  currentMode = config.mode;
  currentRoom = config.roomId;
  currentAILevel = config.aiLevel || 2;

  // KHÔNG set playerColor ở đây nữa, sẽ nhận từ server

  // Join room với thông tin đầy đủ
  socket.emit("join", {
    room: currentRoom,
    mode: currentMode,
    aiLevel: currentAILevel,
    playerColor: config.playerColor || "white", // Vẫn gửi lựa chọn màu cho AI mode
  });

  // Reset undo/redo state
  updateUndoRedoButtons(false, false);

  // Cập nhật status tạm thời
  const statusEl = document.getElementById("status");
  if (statusEl) {
    if (currentMode === "ai") {
      const levelNames = ["Dễ", "Trung Bình", "Khó"];
      statusEl.innerText = `Đang kết nối... Chế độ AI - Cấp độ: ${
        levelNames[currentAILevel - 1] || "Trung Bình"
      }`;
    } else {
      statusEl.innerText = `Đang kết nối... Phòng: ${currentRoom}`;
    }
  }

  // Ẩn iframe và hiện game
  document.getElementById("mode-iframe").style.display = "none";
  showGameSection();
}

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

// Sync: Show game section
function showGameSection() {
  showSection("game-section");
}

// Sync: Join room (cho multi)
function joinRoom() {
  const room = document.getElementById("roomInput").value;
  if (room) {
    currentRoom = room;
    currentMode = "multi";
    // KHÔNG set playerColor ở đây nữa, sẽ nhận từ server
    socket.emit("join", {
      room: currentRoom,
      mode: "multi",
      // KHÔNG gửi playerColor cho multiplayer
    });

    // Reset undo/redo state
    updateUndoRedoButtons(false, false);

    document.getElementById("status").innerText = "Đang kết nối...";
    showGameSection();
  } else {
    alert("Vui lòng nhập Room ID!");
  }
}

// Sync: Select mode (gọi từ message của playmode/chedochoi.js) - CẬP NHẬT
function selectMode(mode, aiLevel = null) {
  console.log("Selecting mode from playmode:", mode, "AI Level:", aiLevel);
  currentMode = mode;
  currentAILevel = aiLevel || 2;

  if (mode === "ai") {
    currentRoom = "ai_" + Math.random().toString(36).substring(2, 10);
    // KHÔNG set playerColor ở đây nữa, sẽ nhận từ server
    socket.emit("join", {
      room: currentRoom,
      mode: "ai",
      aiLevel: currentAILevel,
      playerColor: "white", // Vẫn gửi màu mặc định cho AI
    });

    // Reset undo/redo state
    updateUndoRedoButtons(false, false);

    const statusEl = document.getElementById("status");
    if (statusEl) {
      statusEl.innerText = "Đang kết nối...";
    }
    document.getElementById("mode-iframe").style.display = "none";
    showGameSection();
  } else {
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
        const imgSrc = `./static/images/${pieceMap[piece] || piece}.png`;
        img.src = imgSrc;
        img.alt = piece;
        img.onload = () => console.log("Tải ảnh thành công:", imgSrc);
        img.onerror = () => {
          console.error("Lỗi tải ảnh:", imgSrc);
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

      square.addEventListener("click", () => handleClick(row, col, piece));
      boardDiv.appendChild(square);
    }
  }
}

// SỬA QUAN TRỌNG: Handle click board - sửa logic kiểm tra lượt đi
function handleClick(row, col, piece) {
  if (!currentRoom) {
    alert("Bạn cần join room trước!");
    return;
  }

  console.log(
    `🖱️ Click tại [${row}, ${col}], quân: ${piece}, lượt hiện tại: ${
      currentWhiteToMove ? "Trắng" : "Đen"
    }, màu người chơi: ${playerColor}`
  );

  // THÊM: Kiểm tra xem ô được click có quân cờ không và có phải quân của người chơi không
  if (piece !== "--") {
    const pieceColor = piece[0]; // 'w' hoặc 'b'
    const isPlayerPiece =
      (playerColor === "white" && pieceColor === "w") ||
      (playerColor === "black" && pieceColor === "b");

    if (!isPlayerPiece) {
      console.log("❌ Đây không phải quân của bạn!");
      alert("Đây không phải quân của bạn!");
      return;
    }
  }

  // SỬA: Kiểm tra lượt đi dựa trên màu người chơi và lượt hiện tại
  const isPlayerTurn =
    (playerColor === "white" && currentWhiteToMove) ||
    (playerColor === "black" && !currentWhiteToMove);

  if (!isPlayerTurn) {
    console.log("⏳ Chưa đến lượt của bạn!");
    alert("Chưa đến lượt của bạn!");
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

    // THÊM: Hiển thị loading nếu là AI
    if (currentMode === "ai") {
      document.getElementById("turn").innerText = "Đang xử lý...";
    }

    console.log(
      `🎯 Di chuyển từ [${from.row}, ${from.col}] đến [${to.row}, ${to.col}]`
    );
    socket.emit("make_move", { room: currentRoom, from, to });
    selectedSquare = null;
  } else {
    // THÊM: Chỉ cho phép chọn quân của mình
    if (piece !== "--") {
      const pieceColor = piece[0];
      const isPlayerPiece =
        (playerColor === "white" && pieceColor === "w") ||
        (playerColor === "black" && pieceColor === "b");

      if (isPlayerPiece) {
        selectedSquare = { row, col };
        drawBoard(currentBoard);
      } else {
        console.log("❌ Bạn không thể chọn quân của đối phương!");
        alert("Bạn không thể chọn quân của đối phương!");
      }
    }
  }
}

// THÊM: Hàm undo move
function undoMove() {
  if (!currentRoom) {
    alert("Bạn cần join room trước!");
    return;
  }

  if (!canUndo) {
    alert("Không thể undo lúc này!");
    return;
  }

  console.log("↩️ Yêu cầu undo move");
  socket.emit("undo_move", {
    room: currentRoom,
    mode: currentMode,
  });
}

// THÊM: Hàm redo move
function redoMove() {
  if (!currentRoom) {
    alert("Bạn cần join room trước!");
    return;
  }

  if (!canRedo) {
    alert("Không thể redo lúc này!");
    return;
  }

  console.log("↪️ Yêu cầu redo move");
  socket.emit("redo_move", {
    room: currentRoom,
    mode: currentMode,
  });
}

// THÊM: Hàm cập nhật trạng thái nút undo/redo
function updateUndoRedoButtons(canUndoState, canRedoState) {
  const undoBtn = document.getElementById("undoBtn");
  const redoBtn = document.getElementById("redoBtn");

  if (undoBtn) {
    undoBtn.disabled = !canUndoState;
    undoBtn.title = canUndoState ? "Hủy nước đi (Ctrl+Z)" : "Không thể undo";
    // THÊM: Cập nhật màu sắc cho nút
    if (canUndoState) {
      undoBtn.style.background = "linear-gradient(45deg, #ff69b4, #ff1493)";
    } else {
      undoBtn.style.background = "#ccc";
    }
  }

  if (redoBtn) {
    redoBtn.disabled = !canRedoState;
    redoBtn.title = canRedoState
      ? "Làm lại nước đi (Ctrl+Y)"
      : "Không thể redo";
    // THÊM: Cập nhật màu sắc cho nút
    if (canRedoState) {
      redoBtn.style.background = "linear-gradient(45deg, #ff69b4, #ff1493)";
    } else {
      redoBtn.style.background = "#ccc";
    }
  }

  canUndo = canUndoState;
  canRedo = canRedoState;

  console.log(`🔄 Undo: ${canUndo}, Redo: ${canRedo}`);
}

// Sync: Reset board
function resetBoard() {
  if (currentRoom) {
    socket.emit("reset", {
      room: currentRoom,
      mode: currentMode,
    });
  }
}

// THÊM: Socket event cho reset
socket.on("reset", (data) => {
  console.log("🔄 Board đã được reset");
});

// THÊM QUAN TRỌNG: Socket event nhận màu được gán từ server
socket.on("player_assigned", (data) => {
  playerColor = data.color;
  console.log(`🎯 Server gán màu cho bạn: ${playerColor}`);

  // Cập nhật status với màu thực tế
  const statusEl = document.getElementById("status");
  if (statusEl) {
    const colorText = playerColor === "white" ? "Trắng" : "Đen";
    if (currentMode === "ai") {
      const levelNames = ["Dễ", "Trung Bình", "Khó"];
      statusEl.innerText = `Chế độ AI - Cấp độ: ${
        levelNames[currentAILevel - 1] || "Trung Bình"
      } | Màu: ${colorText}`;
    } else {
      statusEl.innerText = `Đã tham gia phòng: ${currentRoom} | Màu: ${colorText}`;
    }
  }
});

// THÊM: Socket event phòng đầy
socket.on("room_full", (data) => {
  alert(data.msg);
  showSection("home-section");
});

// THÊM: Socket events cho undo/redo
socket.on("undo_success", (data) => {
  console.log("✅ " + data.msg);
  // Có thể thêm thông báo toast ở đây
});

socket.on("undo_failed", (data) => {
  console.log("❌ " + data.msg);
  alert(data.msg);
});

socket.on("redo_success", (data) => {
  console.log("✅ " + data.msg);
  // Có thể thêm thông báo toast ở đây
});

socket.on("redo_failed", (data) => {
  console.log("❌ " + data.msg);
  alert(data.msg);
});

// Sync: Socket events
socket.on("connect_error", (error) => {
  console.error("Connection error:", error);
  alert("Không thể kết nối đến server. Vui lòng thử lại!");
});

socket.on("connect", () => {
  console.log("✅ Connected to server");
});

// SỬA QUAN TRỌNG: Socket event board_update - cập nhật biến currentWhiteToMove và undo/redo state
socket.on("board_update", (data) => {
  currentBoard = data.board;
  currentWhiteToMove = data.whiteToMove; // THÊM: Cập nhật trạng thái lượt đi

  drawBoard(currentBoard);

  // THÊM: Cập nhật trạng thái nút undo/redo
  const canUndoState = data.canUndo !== undefined ? data.canUndo : canUndo;
  const canRedoState = data.canRedo !== undefined ? data.canRedo : canRedo;
  updateUndoRedoButtons(canUndoState, canRedoState);

  // SỬA: Cập nhật hiển thị lượt đi với thông tin chi tiết
  const turnEl = document.getElementById("turn");
  if (turnEl) {
    const currentTurnColor = data.whiteToMove ? "Trắng" : "Đen";
    const isPlayerTurn =
      (playerColor === "white" && data.whiteToMove) ||
      (playerColor === "black" && !data.whiteToMove);

    if (isPlayerTurn) {
      turnEl.innerText = `Lượt của bạn (${currentTurnColor})`;
      turnEl.style.color = "#ff69b4";
      turnEl.style.background = "linear-gradient(135deg, #fff5f7, #ffeef2)";
      turnEl.style.border = "2px solid #ff69b4";
    } else {
      turnEl.innerText = `Lượt đối phương (${currentTurnColor})`;
      turnEl.style.color = "#666";
      turnEl.style.background = "linear-gradient(135deg, #f8f9fa, #e9ecef)";
      turnEl.style.border = "2px solid #ddd";
    }
  }

  console.log(
    `🔄 Board updated - Lượt hiện tại: ${data.whiteToMove ? "Trắng" : "Đen"}`
  );
});

socket.on("invalid_move", (data) => {
  alert(data.msg);
  drawBoard(currentBoard);
});

socket.on("game_over", (data) => {
  alert(data.msg);
});

// THÊM: Keyboard shortcuts cho undo/redo
document.addEventListener("keydown", function (event) {
  // Chỉ xử lý khi đang ở trong game section
  const gameSection = document.getElementById("game-section");
  if (!gameSection || gameSection.style.display !== "block") {
    return;
  }

  if ((event.ctrlKey || event.metaKey) && !event.altKey) {
    if (event.key === "z" || event.key === "Z") {
      event.preventDefault();
      if (canUndo) {
        console.log("⌨️ Keyboard shortcut: Ctrl+Z - Undo");
        undoMove();
      } else {
        console.log("⌨️ Ctrl+Z pressed but cannot undo");
      }
    } else if (event.key === "y" || event.key === "Y") {
      event.preventDefault();
      if (canRedo) {
        console.log("⌨️ Keyboard shortcut: Ctrl+Y - Redo");
        redoMove();
      } else {
        console.log("⌨️ Ctrl+Y pressed but cannot redo");
      }
    }
  }
});

// QUAN TRỌNG: CẬP NHẬT message listener để xử lý GAME_START
window.addEventListener("message", (event) => {
  console.log("Received message from playmode iframe:", event.data);

  if (event.data && event.data.type === "GAME_START") {
    // Xử lý message mới - bắt đầu game từ cấu hình
    startGameFromConfig(event.data);
  } else if (event.data && event.data.type === "MODE_SELECTED") {
    // Giữ lại để tương thích ngược
    selectMode(event.data.mode, event.data.aiLevel);
  } else if (event.data && event.data.type === "GO_BACK") {
    showSection("home-section");
    document.getElementById("mode-iframe").style.display = "none";
  }
});

// Sync: Init app
window.onload = function () {
  showSection("home-section");

  // THÊM: Khởi tạo undo/redo state
  updateUndoRedoButtons(false, false);
};

socket.on("disconnect", (reason) => {
  console.log("Disconnected:", reason);
  if (reason === "io server disconnect") {
    socket.connect();
  }
});
