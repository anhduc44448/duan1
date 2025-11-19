from flask import Flask, send_from_directory, request, jsonify, session
from flask_socketio import SocketIO, emit, join_room
from ChessEngine import GameState, Move
from ChessAI import findBestMove
import random
import pymysql
import bcrypt
from datetime import datetime

app = Flask(__name__, static_folder="static", template_folder=".")
app.secret_key = 'chess_app_secret_key_2024'
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='gevent')

# MySQL Configuration
MYSQL_CONFIG = {
    'host': 'localhost',
    'port': 3306,
    'user': 'root',
    'password': '050705',
    'database': 'covua',
    'charset': 'utf8mb4',
    'cursorclass': pymysql.cursors.DictCursor
}

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
        self.move_history = []
        self.redo_stack = []

    def randomize_first_move(self):
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
            self.move_history.append(move)
            self.redo_stack.clear()
            self.check_game_over()
            return True
        return False

    def undo_move(self):
        if len(self.game_state.move_log) > 0:
            last_move = self.game_state.move_log[-1]
            self.redo_stack.append(last_move)
            self.game_state.undoMove()
            if self.move_history:
                self.move_history.pop()
            print(f"↩️ Đã undo nước đi: {last_move}")
            return True
        return False

    def redo_move(self):
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
        if not self.is_ai:
            return False
        if self.ai_color == "white":
            return self.game_state.white_to_move
        else:
            return not self.game_state.white_to_move

    def can_undo(self):
        return len(self.game_state.move_log) > 0

    def can_redo(self):
        return len(self.redo_stack) > 0

def ai_move_task(gs, room):
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
                gs.move_history.append(ai_move)
                gs.redo_stack.clear()
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

def get_db_connection():
    return pymysql.connect(**MYSQL_CONFIG)

def init_db():
    try:
        config_without_db = MYSQL_CONFIG.copy()
        config_without_db.pop('database', None)
        
        conn = pymysql.connect(**config_without_db)
        cursor = conn.cursor()
        
        cursor.execute("CREATE DATABASE IF NOT EXISTS covua CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
        cursor.execute("USE covua")
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP NULL,
                games_played INT DEFAULT 0,
                wins INT DEFAULT 0
            )
        ''')
        
        conn.commit()
        cursor.close()
        conn.close()
        print("✅ MySQL database initialized successfully!")
        
    except Exception as e:
        print(f"❌ Database initialization error: {e}")

@app.route('/api/register', methods=['POST'])
def register():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    
    if not username or not password:
        return jsonify({'success': False, 'message': 'Username và password không được để trống'})
    
    if len(username) < 3:
        return jsonify({'success': False, 'message': 'Username phải có ít nhất 3 ký tự'})
    
    if len(password) < 6:
        return jsonify({'success': False, 'message': 'Password phải có ít nhất 6 ký tự'})
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute('SELECT id FROM users WHERE username = %s', (username,))
        existing_user = cursor.fetchone()
        
        if existing_user:
            cursor.close()
            conn.close()
            return jsonify({'success': False, 'message': 'Username đã tồn tại'})
        
        hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())
        
        cursor.execute(
            'INSERT INTO users (username, password) VALUES (%s, %s)',
            (username, hashed_password.decode('utf-8'))
        )
        conn.commit()
        cursor.close()
        conn.close()
        
        return jsonify({'success': True, 'message': 'Đăng ký thành công!'})
        
    except Exception as e:
        return jsonify({'success': False, 'message': f'Lỗi server: {str(e)}'})

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    
    if not username or not password:
        return jsonify({'success': False, 'message': 'Username và password không được để trống'})
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute('SELECT * FROM users WHERE username = %s', (username,))
        user = cursor.fetchone()
        
        if user and bcrypt.checkpw(password.encode('utf-8'), user['password'].encode('utf-8')):
            cursor.execute(
                'UPDATE users SET last_login = %s WHERE id = %s',
                (datetime.now(), user['id'])
            )
            conn.commit()
            cursor.close()
            conn.close()
            
            session['user_id'] = user['id']
            session['username'] = user['username']
            
            return jsonify({
                'success': True, 
                'message': 'Đăng nhập thành công!',
                'user': {
                    'id': user['id'],
                    'username': user['username'],
                    'games_played': user['games_played'],
                    'wins': user['wins']
                }
            })
        else:
            cursor.close()
            conn.close()
            return jsonify({'success': False, 'message': 'Username hoặc password không đúng'})
            
    except Exception as e:
        return jsonify({'success': False, 'message': f'Lỗi server: {str(e)}'})

@app.route('/api/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'success': True, 'message': 'Đã đăng xuất'})

@app.route('/api/user')
def get_user():
    if 'user_id' in session:
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute(
                'SELECT id, username, games_played, wins FROM users WHERE id = %s',
                (session['user_id'],)
            )
            user = cursor.fetchone()
            cursor.close()
            conn.close()
            
            if user:
                return jsonify({
                    'logged_in': True,
                    'user': {
                        'id': user['id'],
                        'username': user['username'],
                        'games_played': user['games_played'],
                        'wins': user['wins']
                    }
                })
        except Exception as e:
            print(f"Error getting user: {e}")
    
    return jsonify({'logged_in': False})

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
    
    if data["mode"] == "multi":
        if room not in room_players:
            room_players[room] = {"white": None, "black": None}
        
        if room_players[room]["white"] is None:
            assigned_color = "white"
            room_players[room]["white"] = player_id
            print(f"🎮 Người chơi {player_id} được gán màu: Trắng")
        elif room_players[room]["black"] is None:
            assigned_color = "black"
            room_players[room]["black"] = player_id
            print(f"🎮 Người chơi {player_id} được gán màu: Đen")
        else:
            emit("room_full", {"msg": "Phòng đã đầy! Chỉ cho phép 2 người chơi."}, to=player_id)
            return
    else:
        assigned_color = data.get("playerColor", "white")
    
    if room not in game_states:
        game_states[room] = CustomGameState()
        print(f"🆕 Tạo game state mới cho room {room}")
    
    gs = game_states[room]
    gs.room = room
    gs.is_ai = data["mode"] == "ai"
    
    if gs.is_ai:
        gs.ai_level = data.get("aiLevel", 2)
    
    gs.player_color = assigned_color
    gs.ai_color = "black" if gs.player_color == "white" else "white"
    
    gs.randomize_first_move()
    
    print(f"🎮 Room {room} - Mode: {'AI' if gs.is_ai else 'Multi'}")
    print(f"   Người chơi: {gs.player_color}, {'AI: ' + gs.ai_color if gs.is_ai else 'Đối thủ: ' + ('Đen' if gs.player_color == 'white' else 'Trắng')}")
    print(f"   Lượt đi đầu: {'Trắng' if gs.game_state.white_to_move else 'Đen'}")
    
    emit("player_assigned", {"color": assigned_color}, to=player_id)
    
    if gs.is_ai and gs.should_ai_move():
        print(f"🚀 AI đi trước! Gọi AI ngay...")
        socketio.start_background_task(ai_move_task, gs, room)
    
    emit("board_update", {
        "board": gs.get_board(), 
        "whiteToMove": gs.game_state.white_to_move,
        "playerColor": assigned_color,
        "canUndo": gs.can_undo(),
        "canRedo": gs.can_redo()
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
            "canUndo": gs.can_undo(),
            "canRedo": gs.can_redo()
        }, room=room)
        
        if gs.should_ai_move():
            print(f"🔄 Đến lượt AI ({gs.ai_color}) với level {gs.ai_level}")
            socketio.start_background_task(ai_move_task, gs, room)
        else:
            print("ℹ️ Tiếp tục lượt người chơi")
            
    else:
        emit("invalid_move", {"msg": "❌ Nước đi không hợp lệ!"}, to=request.sid)

@socketio.on('undo_move')
def on_undo_move(data):
    room = data["room"]
    gs = game_states.get(room)
    if not gs:
        return
    
    print(f"↩️ Người chơi ({gs.player_color}) yêu cầu undo")
    
    if gs.is_ai or data.get("mode") == "multi":
        success = gs.undo_move()
        if success:
            emit("board_update", {
                "board": gs.get_board(), 
                "whiteToMove": gs.game_state.white_to_move,
                "playerColor": gs.player_color,
                "canUndo": gs.can_undo(),
                "canRedo": gs.can_redo()
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
    room = data["room"]
    gs = game_states.get(room)
    if not gs:
        return
    
    print(f"↪️ Người chơi ({gs.player_color}) yêu cầu redo")
    
    if gs.is_ai or data.get("mode") == "multi":
        success = gs.redo_move()
        if success:
            emit("board_update", {
                "board": gs.get_board(), 
                "whiteToMove": gs.game_state.white_to_move,
                "playerColor": gs.player_color,
                "canUndo": gs.can_undo(),
                "canRedo": gs.can_redo()
            }, room=room)
            emit("redo_success", {"msg": "Đã làm lại nước đi!"}, room=room)
            print(f"✅ Redo thành công cho room {room}")
        else:
            emit("redo_failed", {"msg": "Không thể làm lại nước đi!"}, room=room)
            print(f"❌ Redo thất bại cho room {room}")
    else:
        emit("redo_failed", {"msg": "Chức năng redo không khả dụng trong chế độ này!"}, room=room)

@socketio.on('resign')
def on_resign(data):
    room = data["room"]
    gs = game_states.get(room)
    if not gs:
        return
    
    player_id = request.sid
    print(f"🏳️ Người chơi {player_id} ({gs.player_color}) đầu hàng trong room {room}")
    
    if gs.player_color == "white":
        winner = "Đen"
        loser = "Trắng"
    else:
        winner = "Trắng"
        loser = "Đen"
    
    msg = f"{loser} đã đầu hàng! {winner} thắng!"
    
    emit("game_over", {"msg": msg, "type": "resign"}, room=room)
    
    old_is_ai = gs.is_ai
    old_ai_level = gs.ai_level
    old_player_color = gs.player_color
    
    game_states[room] = CustomGameState()
    gs = game_states[room]
    gs.room = room
    gs.is_ai = old_is_ai
    gs.ai_level = old_ai_level
    gs.player_color = old_player_color
    gs.ai_color = "black" if gs.player_color == "white" else "white"
    
    gs.randomize_first_move()
    
    print(f"🔄 Đã reset game sau khi đầu hàng. Lượt đi đầu: {'Trắng' if gs.game_state.white_to_move else 'Đen'}")

@socketio.on('reset')
def on_reset(data):
    room = data["room"]
    if room in game_states:
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
        
        gs.randomize_first_move()
        
        print(f"🔄 Reset room {room} - Player Color: {gs.player_color}")
        print(f"   Lượt đi đầu: {'Trắng' if gs.game_state.white_to_move else 'Đen'}")
        
        if gs.is_ai and gs.should_ai_move():
            print(f"🚀 AI đi trước sau reset! Gọi AI ngay...")
            socketio.start_background_task(ai_move_task, gs, room)
        
        emit("board_update", {
            "board": gs.get_board(), 
            "whiteToMove": gs.game_state.white_to_move,
            "playerColor": gs.player_color,
            "canUndo": gs.can_undo(),
            "canRedo": gs.can_redo()
        }, room=room)

@socketio.on('disconnect')
def on_disconnect():
    player_id = request.sid
    print(f"👋 Người chơi {player_id} đã ngắt kết nối")
    
    rooms_to_remove = []
    for room, players in room_players.items():
        if players["white"] == player_id:
            players["white"] = None
            print(f"👤 Người chơi Trắng rời khỏi room {room}")
        elif players["black"] == player_id:
            players["black"] = None
            print(f"👤 Người chơi Đen rời khỏi room {room}")
        
        if players["white"] is None and players["black"] is None:
            rooms_to_remove.append(room)
    
    for room in rooms_to_remove:
        del room_players[room]
        print(f"🗑️ Đã xóa room {room} khỏi danh sách")

if __name__ == '__main__':
    init_db()
    socketio.run(app, host="0.0.0.0", port=5000, debug=True)