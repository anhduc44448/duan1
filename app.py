from flask import Flask, send_from_directory, request
from flask_socketio import SocketIO, emit, join_room
import threading
from queue import Queue
from ChessEngine import GameState, Move
from ChessAI import findBestMove

app = Flask(__name__, static_folder="static", template_folder=".")
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='gevent')  # Sử dụng gevent

game_states = {}

class CustomGameState:
    def __init__(self):
        self.game_state = GameState()
        self.is_ai = False
        self.player_color = "white"  # User là trắng, AI là đen
        self.room = None

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
            msg = "Chiếu hết! " + ("Trắng thắng!" if not self.game_state.white_to_move else "Đen thắng!")
            emit("game_over", {"msg": msg}, room=self.room)
        elif self.game_state.stalemate:
            emit("game_over", {"msg": "Hòa cờ!"}, room=self.room)

    def get_board(self):
        return self.game_state.board

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
    emit("board_update", {"board": gs.get_board(), "whiteToMove": gs.game_state.white_to_move}, room=room)

@socketio.on('make_move')
def on_make_move(data):
    room = data["room"]
    gs = game_states.get(room)
    if not gs:
        return
    success = gs.make_move(data["from"], data["to"])
    if success:
        emit("board_update", {"board": gs.get_board(), "whiteToMove": gs.game_state.white_to_move}, room=room)
        if gs.is_ai and not gs.game_state.white_to_move:
            q = Queue()
            t = threading.Thread(target=findBestMove, args=(gs.game_state, gs.game_state.getValidMoves(), q))
            t.start()
            t.join()  # Đợi thread hoàn thành để đồng bộ
            ai_move = q.get()
            if ai_move:
                gs.game_state.makeMove(ai_move)
                emit("board_update", {"board": gs.get_board(), "whiteToMove": gs.game_state.white_to_move}, room=room)
                gs.check_game_over()
    else:
        emit("invalid_move", {"msg": "❌ Nước đi không hợp lệ!"}, to=request.sid)

@socketio.on('reset')
def on_reset(data):
    room = data["room"]
    if room in game_states:
        game_states[room] = CustomGameState()
        gs = game_states[room]
        gs.room = room
        emit("board_update", {"board": gs.get_board(), "whiteToMove": gs.game_state.white_to_move}, room=room)

if __name__ == '__main__':
    socketio.run(app, host="0.0.0.0", port=5000, debug=True)