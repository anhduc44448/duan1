from flask import Flask, send_from_directory, request
from flask_socketio import SocketIO, emit, join_room
import threading
from queue import Queue
from ChessEngine import GameState, Move
from ChessAI import findBestMove  # Import từ file ChessAI.py của bạn

app = Flask(__name__, static_folder="static", template_folder=".")
socketio = SocketIO(app, cors_allowed_origins="*")

class CustomGameState:
    def __init__(self):
        self.game_state = GameState()
        self.is_ai = False
        self.player_color = "white"  # User là trắng, AI là đen

    def make_move(self, from_pos, to_pos):
        move = Move(
            (from_pos["row"], from_pos["col"]),
            (to_pos["row"], to_pos["col"]),
            self.game_state.board
        )
        valid_moves = self.game_state.getValidMoves()
        if move in valid_moves:
            self.game_state.makeMove(move)
            self.check_game_over()  # Kiểm tra end game
            return True
        return False

    def check_game_over(self):
        if self.game_state.checkmate:
            msg = "Chiếu hết! " + ("Trắng thắng!" if not self.game_state.white_to_move else "Đen thắng!")
            emit("game_over", {"msg": msg}, room=self.room)
        elif self.game_state.stalemate:
            emit("game_over", {"msg": "Hòa cờ!"}, room=self.room)

    def get_board(self):
        return self.game_state.board

game_states = {}

@app.route("/")
def index():
    return send_from_directory(".", "index.html")

@app.route('/static/<path:filename>')
def serve_static(filename):
    try:
        return send_from_directory('static', filename)
    except FileNotFoundError:
        print(f"Error: File not found - static/{filename}")
        return "File not found", 404

@socketio.on("join")
def on_join(data):
    room = data["room"]
    mode = data.get("mode", "multi")  # Mặc định multi
    join_room(room)
    if room not in game_states:
        game_states[room] = CustomGameState()
    gs = game_states[room]
    gs.room = room  # Lưu room để emit
    gs.is_ai = (mode == "ai")
    emit("board_update", {"board": gs.get_board(), "whiteToMove": gs.game_state.white_to_move}, room=room)

@socketio.on("make_move")
def on_make_move(data):
    room = data["room"]
    gs = game_states.get(room)
    if not gs:
        return
    success = gs.make_move(data["from"], data["to"])
    if success:
        emit("board_update", {"board": gs.get_board(), "whiteToMove": gs.game_state.white_to_move}, room=room)
        # Nếu mode AI và lượt đen (AI)
        if gs.is_ai and not gs.game_state.white_to_move:
            q = Queue()
            t = threading.Thread(target=findBestMove, args=(gs.game_state, gs.game_state.getValidMoves(), q))
            t.start()
            t.join()  # Đợi để đồng bộ (có thể làm async nếu cần)
            ai_move = q.get()
            if ai_move:
                gs.game_state.makeMove(ai_move)
                emit("board_update", {"board": gs.get_board(), "whiteToMove": gs.game_state.white_to_move}, room=room)
                gs.check_game_over()
    else:
        emit("invalid_move", {"msg": "❌ Nước đi không hợp lệ!"}, to=request.sid)

@socketio.on("reset")
def on_reset(data):
    room = data["room"]
    game_states[room] = CustomGameState()
    gs = game_states[room]
    gs.room = room
    emit("board_update", {"board": gs.get_board(), "whiteToMove": gs.game_state.white_to_move}, room=room)

if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5000, debug=True)