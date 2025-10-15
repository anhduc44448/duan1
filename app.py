from flask import Flask, send_from_directory, request
from flask_socketio import SocketIO, emit, join_room
from ChessEngine import GameState, Move
from ChessAI import findBestMove

app = Flask(__name__, static_folder="static", template_folder=".")
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='gevent')

game_states = {}

class CustomGameState:
    def __init__(self):
        self.game_state = GameState()
        self.is_ai = False
        self.player_color = "white"  # Người chơi luôn là trắng
        self.room = None
        self.ai_level = 2  # Mặc định Trung bình
        self.ai_color = "black"  # THÊM: AI luôn là đen

    def make_move(self, from_pos, to_pos):
        move = Move(
            (from_pos["row"], from_pos["col"]),
            (to_pos["row"], to_pos["col"]),
            self.game_state.board
        )
        valid_moves = self.game_state.getValidMoves()
        if move in valid_moves:
            self.game_state.makeMove(move)
            self.check_game_over()
            return True
        return False

    def check_game_over(self):
        if self.game_state.checkmate:
            winner = "Đen" if self.game_state.white_to_move else "Trắng"
            msg = f"Chiếu hết! {winner} thắng!"
            emit("game_over", {"msg": msg}, room=self.room)
        elif self.game_state.stalemate:
            emit("game_over", {"msg": "Hòa cờ!"}, room=self.room)

    def get_board(self):
        return self.game_state.board

    def should_ai_move(self):
        """QUAN TRỌNG: Kiểm tra xem có phải lượt của AI không"""
        # AI là đen, nên chỉ di chuyển khi đến lượt đen
        return self.is_ai and not self.game_state.white_to_move

def ai_move_task(gs, room):
    """Background task for AI move"""
    try:
        # THÊM: Kiểm tra lại trước khi AI di chuyển
        if not gs.should_ai_move():
            print("⚠️ Không phải lượt của AI, bỏ qua...")
            return
            
        valid_moves = gs.game_state.getValidMoves()
        if valid_moves:
            print(f"🤖 AI (đen) đang tính nước đi với level {gs.ai_level}...")
            ai_move = findBestMove(gs.game_state, valid_moves, gs.ai_level)
            if ai_move:
                gs.game_state.makeMove(ai_move)
                print(f"✅ AI đã di chuyển: {ai_move}")
                socketio.emit("board_update", 
                            {"board": gs.get_board(), "whiteToMove": gs.game_state.white_to_move}, 
                            room=room)
                gs.check_game_over()
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
    if room not in game_states:
        game_states[room] = CustomGameState()
    gs = game_states[room]
    gs.room = room
    gs.is_ai = data["mode"] == "ai"
    
    # THÊM: Lưu level AI từ client
    if gs.is_ai:
        gs.ai_level = data.get("aiLevel", 2)
    
    print(f"🎮 Room {room} - Mode: {'AI' if gs.is_ai else 'Multi'} - AI Level: {gs.ai_level}")
    print(f"   Người chơi: Trắng, AI: Đen")
    emit("board_update", {"board": gs.get_board(), "whiteToMove": gs.game_state.white_to_move}, room=room)

@socketio.on('make_move')
def on_make_move(data):
    room = data["room"]
    gs = game_states.get(room)
    if not gs:
        return
        
    print(f"👤 Người chơi di chuyển từ {data['from']} đến {data['to']}")
    
    success = gs.make_move(data["from"], data["to"])
    if success:
        emit("board_update", {"board": gs.get_board(), "whiteToMove": gs.game_state.white_to_move}, room=room)
        
        # SỬA QUAN TRỌNG: Chỉ gọi AI nếu đúng là lượt của AI
        if gs.should_ai_move():
            print(f"🔄 Đến lượt AI (đen) với level {gs.ai_level}")
            socketio.start_background_task(ai_move_task, gs, room)
        else:
            print("ℹ️ Tiếp tục lượt người chơi")
            
    else:
        emit("invalid_move", {"msg": "❌ Nước đi không hợp lệ!"}, to=request.sid)

@socketio.on('reset')
def on_reset(data):
    room = data["room"]
    if room in game_states:
        # Giữ lại chế độ AI và level khi reset
        old_is_ai = game_states[room].is_ai
        old_ai_level = game_states[room].ai_level
        
        game_states[room] = CustomGameState()
        gs = game_states[room]
        gs.room = room
        gs.is_ai = old_is_ai
        gs.ai_level = old_ai_level
        
        print(f"🔄 Reset room {room} - AI Level: {gs.ai_level}")
        emit("board_update", {"board": gs.get_board(), "whiteToMove": gs.game_state.white_to_move}, room=room)

if __name__ == '__main__':
    socketio.run(app, host="0.0.0.0", port=5000, debug=True)