// Sync: Socket init ở main, toàn cục cho toàn app
const socket = io();
let boardDiv = document.getElementById("chessboard");
let currentBoard = [];
let selectedSquare = null;
let currentRoom = null;
let currentMode = null;
let currentAILevel = 2;
let playerColor = "white"; // Biến lưu màu người chơi
let currentWhiteToMove = true; // Biến lưu trạng thái lượt đi hiện tại
let canUndo = false; // THÊM: Biến theo dõi trạng thái nút undo
let canRedo = false; // THÊM: Biến theo dõi trạng thái nút redo
let lastMove = null; // THÊM: Biến theo dõi nước đi cuối cùng

// THÊM: Biến và hàm quản lý nhạc nền
let backgroundMusic = null;

// THÊM: Hàm khởi tạo nhạc nền
function initBackgroundMusic() {
  backgroundMusic = document.getElementById("background-music");

  if (!backgroundMusic) {
    console.log("❌ Không tìm thấy element nhạc nền");
    return;
  }

  // Đặt volume mặc định
  backgroundMusic.volume = 0.5; // 50% volume

  console.log("✅ Đã khởi tạo nhạc nền");
}

// THÊM: Hàm quản lý nhạc nền theo section
function manageBackgroundMusic(sectionId) {
  if (!backgroundMusic) return;

  const gameSections = ["game-section", "multi-room-section"];
  const isGameSection = gameSections.includes(sectionId);

  if (isGameSection) {
    // Tắt nhạc khi vào game
    backgroundMusic.pause();
    console.log("🔇 Đã tắt nhạc nền (đang trong game)");
  } else {
    // Bật nhạc khi ở các section khác
    backgroundMusic.play().catch((error) => {
      console.log("❌ Lỗi phát nhạc:", error);
    });
    console.log("🔊 Đã bật nhạc nền");
  }
}

// THÊM: Biến và hàm quản lý âm thanh di chuyển
let moveSound = null;

// THÊM: Hàm khởi tạo âm thanh di chuyển
function initMoveSound() {
  moveSound = document.getElementById("move-sound");

  if (!moveSound) {
    console.log("❌ Không tìm thấy element âm thanh di chuyển");
    return;
  }

  // Đặt volume cho âm thanh di chuyển
  moveSound.volume = 0.7; // 70% volume

  console.log("✅ Đã khởi tạo âm thanh di chuyển");
}

// THÊM: Hàm phát âm thanh khi di chuyển quân cờ
function playMoveSound() {
  if (!moveSound) return;

  // Reset âm thanh để có thể phát lại ngay lập tức
  moveSound.currentTime = 0;

  moveSound.play().catch((error) => {
    console.log("❌ Lỗi phát âm thanh di chuyển:", error);
  });

  console.log("🔊 Đã phát âm thanh di chuyển");
}

// THÊM: Hàm tạo hiệu ứng di chuyển quân cờ
function animateMove(from, to, board) {
  console.log(
    `🎬 Bắt đầu animation từ [${from.row}, ${from.col}] đến [${to.row}, ${to.col}]`
  );

  // Vẽ board với hiệu ứng di chuyển
  drawBoard(board, from, to);

  // Phát âm thanh di chuyển sau một chút delay
  setTimeout(() => {
    playMoveSound();
  }, 200);

  // Xóa hiệu ứng sau khi animation kết thúc
  setTimeout(() => {
    const squares = document.querySelectorAll(".piece-moving, .capture");
    squares.forEach((square) => {
      square.classList.remove("piece-moving", "capture");
    });
  }, 600);
}

// THÊM: Cập nhật hàm showSection để quản lý nhạc nền
const originalShowSection = showSection;
showSection = function (sectionId) {
  originalShowSection(sectionId);
  manageBackgroundMusic(sectionId);
};

// THÊM: Cập nhật các hàm navigation khác
const originalLoadModeSection = loadModeSection;
loadModeSection = function () {
  originalLoadModeSection();
  manageBackgroundMusic("mode-section");
};

const originalShowGameSection = showGameSection;
showGameSection = function () {
  originalShowGameSection();
  manageBackgroundMusic("game-section");
};

const originalJoinRoom = joinRoom;
joinRoom = function () {
  originalJoinRoom();
  manageBackgroundMusic("multi-room-section");
};

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

// SỬA: Draw board với hiệu ứng di chuyển chậm
function drawBoard(board, fromSquare = null, toSquare = null) {
  if (!boardDiv || !Array.isArray(board) || board.length !== 8) return;

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

  // Tạo board mới
  const newBoardDiv = document.createElement("div");
  newBoardDiv.id = "chessboard";
  newBoardDiv.style.display = "grid";
  newBoardDiv.style.gridTemplateColumns = "repeat(8, 62.5px)";
  newBoardDiv.style.gridTemplateRows = "repeat(8, 62.5px)";
  newBoardDiv.style.width = "500px";
  newBoardDiv.style.height = "500px";
  newBoardDiv.style.margin = "15px auto";
  newBoardDiv.style.boxShadow = "0 6px 12px rgba(0, 0, 0, 0.1)";

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const square = document.createElement("div");
      square.classList.add("square");
      square.classList.add((row + col) % 2 === 0 ? "light" : "dark");
      square.dataset.row = row;
      square.dataset.col = col;

      const piece = board[row][col];

      // Kiểm tra nếu đây là ô di chuyển đến
      const isMoveToSquare =
        toSquare && toSquare.row === row && toSquare.col === col;
      const isMoveFromSquare =
        fromSquare && fromSquare.row === row && fromSquare.col === col;

      if (piece !== "--") {
        const img = document.createElement("img");
        const imgSrc = `./static/images/${pieceMap[piece] || piece}.png`;
        img.src = imgSrc;
        img.alt = piece;
        img.style.width = "60px";
        img.style.height = "60px";
        img.style.pointerEvents = "none";

        // Thêm hiệu ứng cho quân cờ vừa di chuyển
        if (isMoveToSquare) {
          img.classList.add("piece-moving");
          square.classList.add("piece-moving");

          // Thêm hiệu ứng capture nếu có quân bị ăn
          if (
            currentBoard[row] &&
            currentBoard[row][col] !== "--" &&
            currentBoard[row][col] !== piece
          ) {
            square.classList.add("capture");
          }
        }

        img.onload = () => console.log("Tải ảnh thành công:", imgSrc);
        img.onerror = () => {
          console.error("Lỗi tải ảnh:", imgSrc);
          img.src = "./static/images/default.png";
        };
        square.appendChild(img);
      }

      // Đánh dấu ô được chọn
      if (
        selectedSquare &&
        selectedSquare.row === row &&
        selectedSquare.col === col
      ) {
        square.classList.add("selected");
      }

      // Thêm hiệu ứng cho ô đi từ (nếu có)
      if (isMoveFromSquare && piece === "--") {
        square.style.backgroundColor = "rgba(0, 100, 255, 0.2)";
        square.style.transition = "background-color 1s ease";
      }

      square.addEventListener("click", () => handleClick(row, col, piece));
      newBoardDiv.appendChild(square);
    }
  }

  // Thay thế board cũ bằng board mới
  if (boardDiv.parentNode) {
    boardDiv.parentNode.replaceChild(newBoardDiv, boardDiv);
  }

  // Cập nhật reference
  boardDiv = newBoardDiv;
}

// SỬA QUAN TRỌNG: Handle click board - sửa logic kiểm tra lượt đi và thêm animation
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

    // THÊM: Tạo hiệu ứng di chuyển tạm thời
    const tempBoard = JSON.parse(JSON.stringify(currentBoard));
    const movingPiece = tempBoard[from.row][from.col];
    tempBoard[from.row][from.col] = "--";
    tempBoard[to.row][to.col] = movingPiece;

    // Hiển thị animation
    animateMove(from, to, tempBoard);

    // Gửi move đến server sau khi bắt đầu animation
    setTimeout(() => {
      socket.emit("make_move", { room: currentRoom, from, to });
    }, 400);

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

// THÊM: Hàm đầu hàng
function resignGame() {
  if (!currentRoom) {
    alert("Bạn cần join room trước!");
    return;
  }

  if (!confirm("Bạn có chắc chắn muốn đầu hàng?")) {
    return;
  }

  console.log("🏳️ Yêu cầu đầu hàng");
  socket.emit("resign", {
    room: currentRoom,
    mode: currentMode,
  });
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

// THÊM: Socket event cho game over từ đầu hàng
socket.on("game_over", (data) => {
  if (data.type === "resign") {
    // Hiển thị thông báo đầu hàng
    alert(data.msg);

    // Có thể thêm hiệu ứng visual đặc biệt cho đầu hàng
    const boardDiv = document.getElementById("chessboard");
    if (boardDiv) {
      boardDiv.style.opacity = "0.7";
      setTimeout(() => {
        boardDiv.style.opacity = "1";
      }, 1000);
    }
  } else {
    // Xử lý thông báo game over thông thường
    alert(data.msg);
  }
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
  // Kiểm tra xem có phải là update từ AI không (không phải từ người chơi hiện tại)
  const wasPlayerTurn = currentWhiteToMove;
  const oldBoard = currentBoard;
  currentBoard = data.board;
  currentWhiteToMove = data.whiteToMove; // THÊM: Cập nhật trạng thái lượt đi

  // Tìm nước đi vừa thực hiện (so sánh với board cũ)
  let moveFrom = null;
  let moveTo = null;

  if (oldBoard && oldBoard.length === 8) {
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        if (oldBoard[row][col] !== "--" && currentBoard[row][col] === "--") {
          moveFrom = { row, col };
        }
        if (
          oldBoard[row][col] !== currentBoard[row][col] &&
          currentBoard[row][col] !== "--"
        ) {
          moveTo = { row, col };
        }
      }
    }
  }

  // Nếu tìm thấy nước đi, hiển thị animation
  if (moveFrom && moveTo) {
    animateMove(moveFrom, moveTo, currentBoard);
  } else {
    // Nếu không tìm thấy (reset game, etc.), vẽ bình thường
    drawBoard(currentBoard);
  }

  // THÊM: Phát âm thanh nếu là lượt của AI (khi lượt thay đổi từ người chơi sang AI)
  if (
    currentMode === "ai" &&
    wasPlayerTurn &&
    !currentWhiteToMove &&
    moveFrom &&
    moveTo
  ) {
    setTimeout(() => {
      playMoveSound();
    }, 300);
  }

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

// THÊM: Keyboard shortcuts cho undo/redo và đầu hàng
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
    } else if (event.key === "r" || event.key === "R") {
      event.preventDefault();
      console.log("⌨️ Keyboard shortcut: Ctrl+R - Resign");
      resignGame();
    }
  }
});

// THÊM: Cho phép user bật nhạc bằng 1 click bất kỳ (vượt autoplay policy)
document.addEventListener(
  "click",
  function initAudio() {
    if (backgroundMusic && backgroundMusic.paused) {
      backgroundMusic
        .play()
        .then(() => {
          console.log("🎵 Nhạc nền đã được kích hoạt bởi user click");
        })
        .catch((error) => {
          console.log("❌ Lỗi phát nhạc:", error);
        });
    }
    // Xóa event listener sau khi click đầu tiên
    document.removeEventListener("click", initAudio);
  },
  { once: true }
);

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
  // Khởi tạo nhạc nền
  initBackgroundMusic();

  // THÊM: Khởi tạo âm thanh di chuyển
  initMoveSound();

  showSection("home-section");

  // THÊM: Khởi tạo undo/redo state
  updateUndoRedoButtons(false, false);

  // Bật nhạc nền sau khi khởi tạo
  setTimeout(() => {
    manageBackgroundMusic("home-section");
  }, 500);
};

socket.on("disconnect", (reason) => {
  console.log("Disconnected:", reason);
  if (reason === "io server disconnect") {
    socket.connect();
  }
});
