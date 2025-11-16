from flask import Flask, send_from_directory, request
from flask_socketio import SocketIO, emit, join_room
from ChessEngine import GameState, Move
from ChessAI import findBestMove
import random

app = Flask(__name__, static_folder="static", template_folder=".")
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='gevent')

game_states = {}
room_players = {}

class CustomGameState:
    def __init__(self):
        self.game_state = GameState()
        self.is_ai = False
        self.player_color = "white"
        self.room = None
        self.ai_level = 2
        self.ai_color = "black"
        self.move_history = []  # THÊM: Lịch sử nước đi để redo
        self.redo_stack = []    # THÊM: Stack cho redo

    def randomize_first_move(self):
        """Random lượt đi đầu tiên"""
        self.game_state.white_to_move = random.choice([True, False])
        print(f"🎲 Lượt đi đầu tiên: {'Trắng' if self.game_state.white_to_move else 'Đen'}")

    def make_move(self, from_pos, to_pos):
        move = Move(
            (from_pos["row"], from_pos["col"]),
            (to_pos["row"], to_pos["col"]),
            self.game_state.board
        )
        valid_moves = self.game_state.getValidMoves()
        if move in valid_moves:
            self.game_state.makeMove(move)
            self.move_history.append(move)  # THÊM: Lưu vào lịch sử
            self.redo_stack.clear()  # THÊM: Xóa redo stack khi có nước đi mới
            self.check_game_over()
            return True
        return False

    def undo_move(self):
        """THÊM: Hủy nước đi cuối cùng"""
        if len(self.game_state.move_log) > 0:
            # Lưu nước đi vào redo stack trước khi undo
            last_move = self.game_state.move_log[-1]
            self.redo_stack.append(last_move)
            
            self.game_state.undoMove()
            if self.move_history:
                self.move_history.pop()
            
            print(f"↩️ Đã undo nước đi: {last_move}")
            return True
        return False

    def redo_move(self):
        """THÊM: Làm lại nước đi đã undo"""
        if self.redo_stack:
            move_to_redo = self.redo_stack.pop()
            self.game_state.makeMove(move_to_redo)
            self.move_history.append(move_to_redo)
            
            print(f"↪️ Đã redo nước đi: {move_to_redo}")
            return True
        return False

    def check_game_over(self):
        if self.game_state.checkmate:
            if self.player_color == "white":
                winner = "Đen" if self.game_state.white_to_move else "Trắng"
            else:
                winner = "Trắng" if self.game_state.white_to_move else "Đen"
            msg = f"Chiếu hết! {winner} thắng!"
            emit("game_over", {"msg": msg}, room=self.room)
        elif self.game_state.stalemate:
            emit("game_over", {"msg": "Hòa cờ!"}, room=self.room)

    def get_board(self):
        return self.game_state.board

    def should_ai_move(self):
        """QUAN TRỌNG: Kiểm tra xem có phải lượt của AI không"""
        if not self.is_ai:
            return False
            
        # AI di chuyển khi đến lượt của màu AI
        if self.ai_color == "white":
            return self.game_state.white_to_move
        else:  # ai_color == "black"
            return not self.game_state.white_to_move

    def can_undo(self):
        """THÊM: Kiểm tra có thể undo không"""
        return len(self.game_state.move_log) > 0

    def can_redo(self):
        """THÊM: Kiểm tra có thể redo không"""
        return len(self.redo_stack) > 0

def ai_move_task(gs, room):
    """Background task for AI move"""
    try:
        print(f"🤖 Kiểm tra lượt AI: AI màu {gs.ai_color}, lượt hiện tại: {'Trắng' if gs.game_state.white_to_move else 'Đen'}")
        
        if not gs.should_ai_move():
            print("⚠️ Không phải lượt của AI, bỏ qua...")
            return
            
        valid_moves = gs.game_state.getValidMoves()
        if valid_moves:
            print(f"🤖 AI ({gs.ai_color}) đang tính nước đi với level {gs.ai_level}...")
            ai_move = findBestMove(gs.game_state, valid_moves, gs.ai_level)
            if ai_move:
                gs.game_state.makeMove(ai_move)
                gs.move_history.append(ai_move)  # THÊM: Lưu nước đi AI
                gs.redo_stack.clear()  # THÊM: Xóa redo stack
                print(f"✅ AI ({gs.ai_color}) đã di chuyển: {ai_move}")
                socketio.emit("board_update", 
                            {"board": gs.get_board(), "whiteToMove": gs.game_state.white_to_move, "playerColor": gs.player_color}, 
                            room=room)
                gs.check_game_over()
                
                print(f"🔄 Sau khi AI di chuyển: lượt hiện tại: {'Trắng' if gs.game_state.white_to_move else 'Đen'}")
            else:
                print("❌ AI không tìm thấy nước đi hợp lệ")
        else:
            print("❌ Không có nước đi hợp lệ cho AI")
    except Exception as e:
        print(f"🚨 AI move error: {e}")

@app.route('/')
def serve_index():
    return send_from_directory('.', 'index.html')

@app.route('/playmode/<path:filename>')
def serve_playmode(filename):
    try:
        return send_from_directory('playmode', filename)
    except FileNotFoundError:
        return "File not found", 404

@app.route('/static/<path:filename>')
def serve_static(filename):
    try:
        return send_from_directory('static', filename)
    except FileNotFoundError:
        return "File not found", 404

@socketio.on('join')
def on_join(data):
    room = data["room"]
    join_room(room)
    player_id = request.sid
    
    print(f"🎮 Người chơi {player_id} muốn join room {room}, mode: {data['mode']}")
    
    # THÊM: Xử lý gán màu tự động cho multiplayer
    if data["mode"] == "multi":
        if room not in room_players:
            room_players[room] = {"white": None, "black": None}
        
        # Xác định màu cho người chơi
        if room_players[room]["white"] is None:
            # Người chơi đầu tiên được Trắng
            assigned_color = "white"
            room_players[room]["white"] = player_id
            print(f"🎮 Người chơi {player_id} được gán màu: Trắng")
        elif room_players[room]["black"] is None:
            # Người chơi thứ hai được Đen
            assigned_color = "black"
            room_players[room]["black"] = player_id
            print(f"🎮 Người chơi {player_id} được gán màu: Đen")
        else:
            # Phòng đã đầy
            emit("room_full", {"msg": "Phòng đã đầy! Chỉ cho phép 2 người chơi."}, to=player_id)
            return
    else:
        # Chế độ AI: sử dụng màu người chơi chọn
        assigned_color = data.get("playerColor", "white")
    
    if room not in game_states:
        game_states[room] = CustomGameState()
        print(f"🆕 Tạo game state mới cho room {room}")
    
    gs = game_states[room]
    gs.room = room
    gs.is_ai = data["mode"] == "ai"
    
    if gs.is_ai:
        gs.ai_level = data.get("aiLevel", 2)
    
    # SỬA QUAN TRỌNG: Sử dụng màu được gán thay vì màu từ client
    gs.player_color = assigned_color
    gs.ai_color = "black" if gs.player_color == "white" else "white"
    
    # Random lượt đi đầu tiên
    gs.randomize_first_move()
    
    print(f"🎮 Room {room} - Mode: {'AI' if gs.is_ai else 'Multi'}")
    print(f"   Người chơi: {gs.player_color}, {'AI: ' + gs.ai_color if gs.is_ai else 'Đối thủ: ' + ('Đen' if gs.player_color == 'white' else 'Trắng')}")
    print(f"   Lượt đi đầu: {'Trắng' if gs.game_state.white_to_move else 'Đen'}")
    
    # THÊM: Gửi màu thực tế về client
    emit("player_assigned", {"color": assigned_color}, to=player_id)
    
    # THÊM: Nếu là AI và đến lượt AI đi trước, gọi AI ngay lập tức
    if gs.is_ai and gs.should_ai_move():
        print(f"🚀 AI đi trước! Gọi AI ngay...")
        socketio.start_background_task(ai_move_task, gs, room)
    
    emit("board_update", {
        "board": gs.get_board(), 
        "whiteToMove": gs.game_state.white_to_move,
        "playerColor": assigned_color,  # Gửi màu thực tế
        "canUndo": gs.can_undo(),      # THÊM: Trạng thái nút undo
        "canRedo": gs.can_redo()       # THÊM: Trạng thái nút redo
    }, room=room)

@socketio.on('make_move')
def on_make_move(data):
    room = data["room"]
    gs = game_states.get(room)
    if not gs:
        return
        
    print(f"👤 Người chơi ({gs.player_color}) di chuyển từ {data['from']} đến {data['to']}")
    
    success = gs.make_move(data["from"], data["to"])
    if success:
        emit("board_update", {
            "board": gs.get_board(), 
            "whiteToMove": gs.game_state.white_to_move,
            "playerColor": gs.player_color,
            "canUndo": gs.can_undo(),  # THÊM: Trạng thái nút undo
            "canRedo": gs.can_redo()   # THÊM: Trạng thái nút redo
        }, room=room)
        
        # Gọi AI nếu đúng là lượt của AI
        if gs.should_ai_move():
            print(f"🔄 Đến lượt AI ({gs.ai_color}) với level {gs.ai_level}")
            socketio.start_background_task(ai_move_task, gs, room)
        else:
            print("ℹ️ Tiếp tục lượt người chơi")
            
    else:
        emit("invalid_move", {"msg": "❌ Nước đi không hợp lệ!"}, to=request.sid)

@socketio.on('undo_move')
def on_undo_move(data):
    """THÊM: Socket event cho undo"""
    room = data["room"]
    gs = game_states.get(room)
    if not gs:
        return
    
    print(f"↩️ Người chơi ({gs.player_color}) yêu cầu undo")
    
    # Chỉ cho phép undo trong chế độ AI hoặc multiplayer
    if gs.is_ai or data.get("mode") == "multi":
        success = gs.undo_move()
        if success:
            emit("board_update", {
                "board": gs.get_board(), 
                "whiteToMove": gs.game_state.white_to_move,
                "playerColor": gs.player_color,
                "canUndo": gs.can_undo(),    # THÊM: Gửi trạng thái nút
                "canRedo": gs.can_redo()     # THÊM: Gửi trạng thái nút
            }, room=room)
            emit("undo_success", {"msg": "Đã hủy nước đi!"}, room=room)
            print(f"✅ Undo thành công cho room {room}")
        else:
            emit("undo_failed", {"msg": "Không thể hủy nước đi!"}, room=room)
            print(f"❌ Undo thất bại cho room {room}")
    else:
        emit("undo_failed", {"msg": "Chức năng undo không khả dụng trong chế độ này!"}, room=room)

@socketio.on('redo_move')
def on_redo_move(data):
    """THÊM: Socket event cho redo"""
    room = data["room"]
    gs = game_states.get(room)
    if not gs:
        return
    
    print(f"↪️ Người chơi ({gs.player_color}) yêu cầu redo")
    
    # Chỉ cho phép redo trong chế độ AI hoặc multiplayer
    if gs.is_ai or data.get("mode") == "multi":
        success = gs.redo_move()
        if success:
            emit("board_update", {
                "board": gs.get_board(), 
                "whiteToMove": gs.game_state.white_to_move,
                "playerColor": gs.player_color,
                "canUndo": gs.can_undo(),    # THÊM: Gửi trạng thái nút
                "canRedo": gs.can_redo()     # THÊM: Gửi trạng thái nút
            }, room=room)
            emit("redo_success", {"msg": "Đã làm lại nước đi!"}, room=room)
            print(f"✅ Redo thành công cho room {room}")
        else:
            emit("redo_failed", {"msg": "Không thể làm lại nước đi!"}, room=room)
            print(f"❌ Redo thất bại cho room {room}")
    else:
        emit("redo_failed", {"msg": "Chức năng redo không khả dụng trong chế độ này!"}, room=room)

@socketio.on('reset')
def on_reset(data):
    room = data["room"]
    if room in game_states:
        # Giữ lại chế độ AI, level và màu người chơi khi reset
        old_is_ai = game_states[room].is_ai
        old_ai_level = game_states[room].ai_level
        old_player_color = game_states[room].player_color
        
        game_states[room] = CustomGameState()
        gs = game_states[room]
        gs.room = room
        gs.is_ai = old_is_ai
        gs.ai_level = old_ai_level
        gs.player_color = old_player_color
        gs.ai_color = "black" if gs.player_color == "white" else "white"
        
        # Random lượt đi đầu khi reset
        gs.randomize_first_move()
        
        print(f"🔄 Reset room {room} - Player Color: {gs.player_color}")
        print(f"   Lượt đi đầu: {'Trắng' if gs.game_state.white_to_move else 'Đen'}")
        
        # THÊM: Nếu là AI và đến lượt AI đi trước, gọi AI ngay lập tức
        if gs.is_ai and gs.should_ai_move():
            print(f"🚀 AI đi trước sau reset! Gọi AI ngay...")
            socketio.start_background_task(ai_move_task, gs, room)
        
        emit("board_update", {
            "board": gs.get_board(), 
            "whiteToMove": gs.game_state.white_to_move,
            "playerColor": gs.player_color,
            "canUndo": gs.can_undo(),  # THÊM: Trạng thái nút undo
            "canRedo": gs.can_redo()   # THÊM: Trạng thái nút redo
        }, room=room)

# THÊM: Xử lý khi người chơi rời phòng
@socketio.on('disconnect')
def on_disconnect():
    player_id = request.sid
    print(f"👋 Người chơi {player_id} đã ngắt kết nối")
    
    # Dọn dẹp room_players khi người chơi rời
    rooms_to_remove = []
    for room, players in room_players.items():
        if players["white"] == player_id:
            players["white"] = None
            print(f"👤 Người chơi Trắng rời khỏi room {room}")
        elif players["black"] == player_id:
            players["black"] = None
            print(f"👤 Người chơi Đen rời khỏi room {room}")
        
        # Xóa room nếu không còn người chơi
        if players["white"] is None and players["black"] is None:
            rooms_to_remove.append(room)
    
    for room in rooms_to_remove:
        del room_players[room]
        print(f"🗑️ Đã xóa room {room} khỏi danh sách")

if __name__ == '__main__':
    socketio.run(app, host="0.0.0.0", port=5000, debug=True)